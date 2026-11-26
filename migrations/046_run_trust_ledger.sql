BEGIN IMMEDIATE;

CREATE TABLE run_evidence_versions (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES agent_runs(run_id),
    revision TEXT NOT NULL,
    payload BLOB NOT NULL,
    payload_format TEXT NOT NULL,
    payload_wrapped_dek TEXT,
    UNIQUE (run_id, revision)
);

CREATE TABLE run_trust_ledger (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    run_id TEXT NOT NULL,
    evidence_revision TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    principal_uri TEXT NOT NULL,
    actor_uri TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    causation_id TEXT,
    event_payload_digest TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    FOREIGN KEY (run_id, evidence_revision) REFERENCES run_evidence_versions(run_id, revision)
);
CREATE INDEX run_trust_ledger_by_run ON run_trust_ledger(run_id, sequence);

-- The decision is the Trust Ledger receipt for this human action. The reason
-- and immutable decision fields are stored with vault governance encryption.
CREATE TABLE run_review_ledger (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_id TEXT NOT NULL UNIQUE,
    run_id TEXT NOT NULL,
    evidence_revision TEXT NOT NULL,
    reviewer_uri TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    payload BLOB NOT NULL,
    payload_format TEXT NOT NULL,
    payload_wrapped_dek TEXT,
    UNIQUE (run_id, evidence_revision),
    UNIQUE (reviewer_uri, idempotency_key),
    FOREIGN KEY (run_id, evidence_revision) REFERENCES run_evidence_versions(run_id, revision)
);

CREATE TRIGGER run_versions_no_update BEFORE UPDATE ON run_evidence_versions
BEGIN SELECT RAISE(ABORT, 'evidence history is append-only'); END;
CREATE TRIGGER run_versions_no_delete BEFORE DELETE ON run_evidence_versions
BEGIN SELECT RAISE(ABORT, 'evidence history is append-only'); END;
CREATE TRIGGER run_versions_no_replace BEFORE INSERT ON run_evidence_versions
WHEN EXISTS (SELECT 1 FROM run_evidence_versions
             WHERE sequence = NEW.sequence OR (run_id = NEW.run_id AND revision = NEW.revision))
BEGIN SELECT RAISE(ABORT, 'evidence revision already exists'); END;

CREATE TRIGGER run_trust_no_update BEFORE UPDATE ON run_trust_ledger
BEGIN SELECT RAISE(ABORT, 'run ledger is append-only'); END;
CREATE TRIGGER run_trust_no_delete BEFORE DELETE ON run_trust_ledger
BEGIN SELECT RAISE(ABORT, 'run ledger is append-only'); END;
CREATE TRIGGER run_trust_no_replace BEFORE INSERT ON run_trust_ledger
WHEN EXISTS (SELECT 1 FROM run_trust_ledger WHERE sequence = NEW.sequence OR event_id = NEW.event_id)
BEGIN SELECT RAISE(ABORT, 'run ledger event already exists'); END;

CREATE TRIGGER run_review_no_update BEFORE UPDATE ON run_review_ledger
BEGIN SELECT RAISE(ABORT, 'run review ledger is append-only'); END;
CREATE TRIGGER run_review_no_delete BEFORE DELETE ON run_review_ledger
BEGIN SELECT RAISE(ABORT, 'run review ledger is append-only'); END;
CREATE TRIGGER run_review_no_replace BEFORE INSERT ON run_review_ledger
WHEN EXISTS (SELECT 1 FROM run_review_ledger WHERE sequence = NEW.sequence
             OR receipt_id = NEW.receipt_id
             OR (run_id = NEW.run_id AND evidence_revision = NEW.evidence_revision)
             OR (reviewer_uri = NEW.reviewer_uri AND idempotency_key = NEW.idempotency_key))
BEGIN SELECT RAISE(ABORT, 'run review receipt already exists'); END;

INSERT INTO schema_version (version, applied_at) VALUES (46, datetime('now'));
COMMIT;
