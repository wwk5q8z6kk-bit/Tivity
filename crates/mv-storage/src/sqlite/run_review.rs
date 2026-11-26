//! Run evidence and Trust Ledger writes share the canonical SQLite transaction.
use super::*;

pub(super) fn storage_error(err: rusqlite::Error) -> MvError {
    MvError::Storage(format!("run trust ledger: {err}"))
}

impl SqliteNodeStore {
    pub(super) fn run_evidence_on(
        &self,
        conn: &Connection,
        order_id: Uuid,
        run_id: Uuid,
    ) -> MvResult<Option<RunEvidenceSnapshot>> {
        let Some(run) = self.load_agent_run_from_connection(conn, run_id)? else {
            return Ok(None);
        };
        if run.work_order_id != order_id {
            return Ok(None);
        }
        Ok(Some(RunEvidenceSnapshot {
            run,
            gates: self.gate_results_on(conn, run_id)?,
            artifacts: self.artifacts_on(conn, order_id, Some(run_id))?,
        }))
    }

    pub(super) fn capture_run_evidence(
        &self,
        conn: &Connection,
        order_id: Uuid,
        run_id: Uuid,
    ) -> MvResult<String> {
        let snapshot = self
            .run_evidence_on(conn, order_id, run_id)?
            .ok_or_else(|| MvError::NotFound("run not found".into()))?;
        self.persist_run_evidence(conn, &snapshot)
    }

    fn persist_run_evidence(
        &self,
        conn: &Connection,
        snapshot: &RunEvidenceSnapshot,
    ) -> MvResult<String> {
        let revision = snapshot.revision();
        let run_id = snapshot.run.run_id.to_string();
        let exists: bool = conn.query_row(
            "SELECT EXISTS (SELECT 1 FROM run_evidence_versions WHERE run_id = ?1 AND revision = ?2)",
            params![run_id, revision],
            |row| row.get(0),
        ).map_err(storage_error)?;
        if !exists {
            let (payload, format, dek) =
                self.encode_governance_record(snapshot, "run evidence version")?;
            conn.execute(
                "INSERT INTO run_evidence_versions (run_id, revision, payload, payload_format, payload_wrapped_dek)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![run_id, revision, payload, format, dek],
            ).map_err(storage_error)?;
        }
        Ok(revision)
    }

    pub(super) fn append_run_transition(
        &self,
        conn: &Connection,
        run: &AgentRun,
        from: Option<AgentRunStatus>,
        event: &EventEnvelope,
    ) -> MvResult<()> {
        if event.subject != run.run_uri
            || event.principal != run.principal
            || event.correlation_id != run.correlation_id
            || (from.is_none() && event.actor != run.actor)
            || (from.is_some()
                && event
                    .data
                    .get("to_status")
                    .and_then(serde_json::Value::as_str)
                    != Some(run.status.as_str()))
        {
            return Err(MvError::InvalidInput(
                "event does not describe the committed run".into(),
            ));
        }
        let revision = self.capture_run_evidence(conn, run.work_order_id, run.run_id)?;
        conn.execute(
            "INSERT INTO run_trust_ledger (event_id, run_id, evidence_revision, from_status, to_status,
                principal_uri, actor_uri, correlation_id, causation_id, event_payload_digest, occurred_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![event.id.to_string(), run.run_id.to_string(), revision, from.map(|s| s.as_str()),
                run.status.as_str(), event.principal.as_str(), event.actor.as_str(),
                event.correlation_id.to_string(), event.causation_id.map(|id| id.to_string()),
                event.payload_digest, event.occurred_at.to_rfc3339()],
        ).map_err(storage_error)?;
        Ok(())
    }

    pub(super) fn run_evidence_history_on(
        &self,
        conn: &Connection,
        order_id: Uuid,
        run_id: Uuid,
        revision: Option<&str>,
    ) -> MvResult<Option<RunEvidenceHistory>> {
        let Some(current) = self.run_evidence_on(conn, order_id, run_id)? else {
            return Ok(None);
        };
        let id = run_id.to_string();
        let current_revision = current.revision();
        let snapshot = match revision.filter(|requested| *requested != current_revision.as_str()) {
            None => current,
            Some(requested) => {
                let row = conn.query_row(
                    "SELECT payload, payload_format, payload_wrapped_dek FROM run_evidence_versions
                     WHERE run_id = ?1 AND revision = ?2",
                    params![id, requested],
                    read_payload,
                ).optional().map_err(storage_error)?;
                let Some((bytes, format, dek)) = row else {
                    return Ok(None);
                };
                let snapshot: RunEvidenceSnapshot = self.decode_governance_record(
                    &bytes,
                    &format,
                    dek.as_deref(),
                    "run evidence version",
                )?;
                if snapshot.run.work_order_id != order_id
                    || snapshot.run.run_id != run_id
                    || snapshot.revision() != requested
                {
                    return Err(MvError::Storage(
                        "evidence revision failed digest verification".into(),
                    ));
                }
                snapshot
            }
        };

        let mut versions = conn
            .prepare(
                "SELECT revision FROM run_evidence_versions WHERE run_id = ?1 ORDER BY sequence",
            )
            .map_err(storage_error)?;
        let evidence_revisions = versions
            .query_map([&id], |row| row.get(0))
            .map_err(storage_error)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(storage_error)?;

        let mut transitions = conn
            .prepare(
                "SELECT event_id, from_status, to_status, principal_uri, actor_uri, correlation_id,
                    causation_id, evidence_revision, occurred_at
             FROM run_trust_ledger WHERE run_id = ?1 ORDER BY sequence",
            )
            .map_err(storage_error)?;
        let run_transition_receipts = transitions
            .query_map([&id], |row| {
                let parse_status = |idx, status: String| {
                    status
                        .parse()
                        .map_err(|err: String| Self::as_sql_conversion_error(idx, err))
                };
                let parse_uri = |idx| {
                    StableUri::parse(row.get::<_, String>(idx)?)
                        .map_err(|err| Self::as_sql_conversion_error(idx, err))
                };
                Ok(RunTransitionReceipt {
                    event_id: parse_uuid_str(0, &row.get::<_, String>(0)?)?,
                    from_status: row
                        .get::<_, Option<String>>(1)?
                        .map(|s| parse_status(1, s))
                        .transpose()?,
                    to_status: parse_status(2, row.get(2)?)?,
                    principal: parse_uri(3)?,
                    actor: parse_uri(4)?,
                    correlation_id: parse_uuid_str(5, &row.get::<_, String>(5)?)?,
                    causation_id: row
                        .get::<_, Option<String>>(6)?
                        .map(|s| parse_uuid_str(6, &s))
                        .transpose()?,
                    evidence_revision: row.get(7)?,
                    occurred_at: parse_dt_strict(8, &row.get::<_, String>(8)?)?,
                })
            })
            .map_err(storage_error)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(storage_error)?;

        let mut reviews = conn
            .prepare(
                "SELECT payload, payload_format, payload_wrapped_dek FROM run_review_ledger
             WHERE run_id = ?1 ORDER BY sequence",
            )
            .map_err(storage_error)?;
        let rows = reviews
            .query_map([&id], read_payload)
            .map_err(storage_error)?;
        let mut review_decisions = Vec::new();
        for row in rows {
            let (bytes, format, dek) = row.map_err(storage_error)?;
            review_decisions.push(self.decode_governance_record(
                &bytes,
                &format,
                dek.as_deref(),
                "run review receipt",
            )?);
        }
        Ok(Some(RunEvidenceHistory {
            snapshot,
            current_revision,
            evidence_revisions,
            run_transition_receipts,
            review_decisions,
        }))
    }

    pub(super) fn review_run_evidence_on(
        &self,
        conn: &rusqlite::Transaction<'_>,
        order_id: Uuid,
        run_id: Uuid,
        reviewer: &StableUri,
        submission: &RunReviewSubmission,
    ) -> MvResult<RunReviewReceipt> {
        let not_found = || MvError::NotFound("work order or run not found".into());
        let order = self
            .load_work_order_from_connection(conn, order_id)?
            .ok_or_else(not_found)?;
        let space_id = order.space_id.ok_or_else(not_found)?;
        let local = Self::ensure_local_context_node(conn)?;
        let principal_id = reviewer.trailing_uuid().ok_or_else(not_found)?;
        let identity =
            Self::load_identity_by_principal_id(conn, principal_id)?.ok_or_else(not_found)?;
        if StableUri::principal(local, principal_id) != *reviewer
            || identity.principal_uri != *reviewer
            || identity.status != IdentityStatus::Active
            || identity.actor_kind != ActorKind::Human
        {
            return Err(not_found());
        }
        let active: bool = conn
            .query_row(
                "SELECT EXISTS (SELECT 1 FROM spaces WHERE id = ?1 AND state = 'active')",
                [space_id.to_string()],
                |row| row.get(0),
            )
            .map_err(storage_error)?;
        let member = conn
            .query_row(
                "SELECT id, space_id, principal_id, actor_kind, role, state, granted_at, expires_at
             FROM space_memberships WHERE space_id = ?1 AND principal_id = ?2",
                params![space_id.to_string(), principal_id.to_string()],
                row_to_space_membership,
            )
            .optional()
            .map_err(storage_error)?;
        let now = Utc::now();
        if !active
            || !member
                .as_ref()
                .is_some_and(|m| m.actor_kind == ActorKind::Human)
            || authorize_space_operation(member.as_ref(), space_id, SpaceOperation::Write, now)
                != SpaceAuthDecision::Allow
        {
            return Err(not_found());
        }
        let snapshot = self
            .run_evidence_on(conn, order_id, run_id)?
            .ok_or_else(not_found)?;
        if [
            &order.principal,
            &order.actor,
            &snapshot.run.principal,
            &snapshot.run.actor,
        ]
        .contains(&reviewer)
        {
            return Err(MvError::AccessDenied(
                "the work order and run actors cannot review their own work".into(),
            ));
        }
        let reason = submission.reason.trim();
        if reason.is_empty() || reason.len() > 4096 {
            return Err(MvError::InvalidInput(
                "review reason must be 1 to 4096 bytes".into(),
            ));
        }
        let key = submission.idempotency_key.as_str();
        let prior = conn
            .query_row(
                "SELECT payload, payload_format, payload_wrapped_dek FROM run_review_ledger
             WHERE reviewer_uri = ?1 AND idempotency_key = ?2",
                params![reviewer.as_str(), key],
                read_payload,
            )
            .optional()
            .map_err(storage_error)?;
        if let Some((bytes, format, dek)) = prior {
            let receipt: RunReviewReceipt = self.decode_governance_record(
                &bytes,
                &format,
                dek.as_deref(),
                "run review receipt",
            )?;
            if receipt.order_id == order_id
                && receipt.run_id == run_id
                && receipt.space_id == space_id
                && receipt.reviewer == *reviewer
                && receipt.evidence_revision == submission.expected_revision
                && receipt.decision == submission.decision
                && receipt.reason == reason
            {
                return Ok(receipt);
            }
            return Err(MvError::IdempotencyConflict(
                "review key already used for a different decision".into(),
            ));
        }
        let evidence_revision = snapshot.revision();
        if evidence_revision != submission.expected_revision {
            return Err(MvError::Conflict(
                "run evidence changed; reopen and review the current revision".into(),
            ));
        }
        if !snapshot.run.status.is_terminal()
            || (submission.decision == RunReviewDecision::Accept
                && snapshot.run.status != AgentRunStatus::Completed)
        {
            return Err(MvError::Conflict(
                "only terminal runs can be reviewed, and only completed runs accepted".into(),
            ));
        }
        if submission.decision == RunReviewDecision::Accept
            && snapshot
                .gates
                .iter()
                .any(|gate| gate.outcome != GateOutcome::Pass)
        {
            return Err(MvError::Conflict(
                "evidence contains a failed or blocked check; return this revision instead".into(),
            ));
        }
        let exists: bool = conn.query_row(
            "SELECT EXISTS (SELECT 1 FROM run_review_ledger WHERE run_id = ?1 AND evidence_revision = ?2)",
            params![run_id.to_string(), evidence_revision], |row| row.get(0),
        ).map_err(storage_error)?;
        if exists {
            return Err(MvError::Conflict(
                "this evidence revision already has a decision".into(),
            ));
        }
        // A pre-ledger run can be reviewed without claiming a reconstructed history.
        self.persist_run_evidence(conn, &snapshot)?;
        let receipt = RunReviewReceipt {
            receipt_id: Uuid::now_v7(),
            order_id,
            run_id,
            space_id,
            evidence_revision,
            reviewer: reviewer.clone(),
            decision: submission.decision,
            reason: reason.into(),
            decided_at: now,
        };
        let (payload, format, dek) =
            self.encode_governance_record(&receipt, "run review receipt")?;
        conn.execute(
            "INSERT INTO run_review_ledger (receipt_id, run_id, evidence_revision, reviewer_uri,
                idempotency_key, payload, payload_format, payload_wrapped_dek)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                receipt.receipt_id.to_string(),
                run_id.to_string(),
                receipt.evidence_revision,
                reviewer.as_str(),
                key,
                payload,
                format,
                dek
            ],
        )
        .map_err(storage_error)?;
        Ok(receipt)
    }
}

fn read_payload(row: &rusqlite::Row<'_>) -> rusqlite::Result<(Vec<u8>, String, Option<String>)> {
    Ok((row.get(0)?, row.get(1)?, row.get(2)?))
}
