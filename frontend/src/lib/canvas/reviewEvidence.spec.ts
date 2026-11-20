import { expect, it } from 'vitest';
import type { AgentRunView, ArtifactView, GateResultView } from '$lib/api/workOrders';
import { reviewFingerprint } from './reviewEvidence';

it('retains a v1 pin across readers and changes when the evidence changes', async () => {
	const run: AgentRunView = {
		run_id: 'run',
		run_uri: 'uri',
		work_order_id: 'order',
		node_id: 'node',
		attempt_no: 2,
		status: 'completed',
		failure_class: null,
		actor: 'agent',
		started_at: null,
		ended_at: null
	};
	const gate: GateResultView = {
		gate: 'g2',
		outcome: 'pass',
		evaluator_actor: 'reviewer',
		evidence_digest: 'abc',
		detail: null,
		evaluated_at: 'now'
	};
	const artifact: ArtifactView = {
		artifact_id: 'file',
		artifact_uri: 'uri',
		run_id: 'run',
		artifact_kind: 'report',
		content_digest: 'def',
		sensitivity: 'private',
		retention: 'default',
		created_at: 'now',
		provenance: [
			{ relation: 'input', resource: 'one' },
			{ relation: 'input', resource: 'two' }
		]
	};
	const gates = [gate, { ...gate, detail: 'second' }];
	const artifacts = [artifact, { ...artifact, artifact_id: 'second' }];
	const pin = await reviewFingerprint('order', run, gates, artifacts);
	expect(pin).toBe('v1:b433f742f26764874e7ba196d2552667cd6b426ffff7f932628999055ce0cf7d');
	expect(
		await reviewFingerprint(
			'order',
			run,
			[...gates].reverse(),
			[...artifacts].reverse().map((a) => ({ ...a, provenance: [...a.provenance].reverse() }))
		)
	).toBe(pin);
	expect(await reviewFingerprint('order', run, [gate], artifacts)).not.toBe(pin);
	expect(
		await reviewFingerprint('order', run, gates, [
			{ ...artifact, content_digest: 'new' },
			artifacts[1]
		])
	).not.toBe(pin);
});
