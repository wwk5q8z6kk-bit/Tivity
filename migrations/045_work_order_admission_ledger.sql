-- Preserve the attribution of a committed work order independently of delivery
-- state. Older events may have no policy envelope when admission was off.
BEGIN IMMEDIATE;

CREATE TABLE work_order_admission_ledger (
    work_order_id TEXT PRIMARY KEY NOT NULL,
    event_id TEXT NOT NULL UNIQUE,
    principal_uri TEXT NOT NULL,
    actor_uri TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    event_payload_digest TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    action_envelope TEXT CHECK (action_envelope IS NULL OR json_type(action_envelope) = 'object')
);

-- Only backfill an original admission that can be matched to a canonical
-- order. Restored orders without an original event have no local receipt.
INSERT INTO work_order_admission_ledger
SELECT w.work_order_id, e.event_id, e.principal_uri,
       json_extract(e.envelope_json, '$.actor'), e.correlation_id,
       e.idempotency_key, e.payload_digest, e.created_at,
       json_extract(e.envelope_json, '$.data.action_envelope')
FROM work_orders w JOIN interoperability_outbox e
  ON e.subject_uri = w.work_order_uri AND e.source_uri = w.governing_node_uri
 AND e.principal_uri = w.principal_uri AND e.idempotency_key = w.idempotency_key
 AND e.event_type = 'dev.mindvault.work-order.admitted.v1';

CREATE TRIGGER admission_ledger_no_update BEFORE UPDATE ON work_order_admission_ledger
BEGIN SELECT RAISE(ABORT, 'admission ledger is append-only'); END;
CREATE TRIGGER admission_ledger_no_delete BEFORE DELETE ON work_order_admission_ledger
BEGIN SELECT RAISE(ABORT, 'admission ledger is append-only'); END;
-- REPLACE can remove a conflicting row even with recursive triggers disabled.
CREATE TRIGGER admission_ledger_no_replace BEFORE INSERT ON work_order_admission_ledger
WHEN EXISTS (SELECT 1 FROM work_order_admission_ledger
             WHERE work_order_id = NEW.work_order_id OR event_id = NEW.event_id)
BEGIN SELECT RAISE(ABORT, 'admission ledger entry already exists'); END;

INSERT INTO schema_version (version, applied_at) VALUES (45, datetime('now'));
COMMIT;
