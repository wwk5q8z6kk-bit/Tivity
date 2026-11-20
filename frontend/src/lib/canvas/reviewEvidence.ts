import type { AgentRunView, ArtifactView, GateResultView } from '$lib/api/workOrders';

// Sort serialized tuples by code unit so API row order and the reader's locale
// cannot change a fingerprint. Keep this format stable for saved v1 pins.
export async function reviewFingerprint(
	orderId: string,
	run: AgentRunView,
	gates: GateResultView[],
	artifacts: ArtifactView[]
) {
	const rows = (tuples: unknown[][]) => tuples.map((tuple) => JSON.stringify(tuple)).sort();
	const manifest = [
		'tivity-review-v1',
		orderId,
		[
			run.run_id,
			run.node_id,
			run.attempt_no,
			run.status,
			run.actor,
			run.failure_class,
			run.started_at,
			run.ended_at
		],
		rows(
			gates.map((g) => [
				g.gate,
				g.outcome,
				g.evaluator_actor,
				g.evidence_digest,
				g.detail,
				g.evaluated_at
			])
		),
		rows(
			artifacts.map((a) => [
				a.artifact_id,
				a.artifact_uri,
				a.artifact_kind,
				a.content_digest,
				a.sensitivity,
				a.retention,
				a.created_at,
				rows((a.provenance ?? []).map((p) => [p.relation, p.resource]))
			])
		)
	];
	const digest = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(JSON.stringify(manifest))
	);
	return (
		'v1:' +
		Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
	);
}
