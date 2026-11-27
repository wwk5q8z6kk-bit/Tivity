import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CapturedIntent, ProactiveInsight } from './types';

const fetchJsonMock = vi.fn();
const { invoke, isTauri } = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({
	invoke,
	isTauri,
	Channel: class {
		id = 42;
		constructor(public onmessage: (message: string | null) => void) {}
	}
}));

vi.mock('$app/environment', () => ({
	browser: true
}));

vi.mock('./client', () => ({
	API_BASE_URL: 'http://127.0.0.1:9470',
	fetchJson: (...args: unknown[]) => fetchJsonMock(...args)
}));

import * as agentApi from './agent';

describe('agent api client', () => {
	beforeEach(() => {
		fetchJsonMock.mockReset();
		invoke.mockReset().mockResolvedValue(undefined);
		isTauri.mockReturnValue(false);
		agentApi.agentRunObservations.set(null);
	});
	afterEach(() => {
		agentApi.disconnectAgentStream();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it('uses the native authenticated stream without passing a credential through the webview', () => {
		const webSocket = vi.fn(function () { return { close: vi.fn() }; });
		vi.stubGlobal('WebSocket', webSocket);
		vi.stubGlobal('location', { protocol: 'tauri:', hostname: 'localhost' });
		isTauri.mockReturnValue(true);
		const receive = vi.fn();
		const unsubscribe = agentApi.agentRunObservations.subscribe(receive);

		agentApi.connectAgentStream();
		agentApi.connectAgentStream();
		expect(webSocket).not.toHaveBeenCalled();
		expect(invoke).toHaveBeenCalledTimes(1);
		const [command, args] = invoke.mock.calls[0];
		expect(command).toBe('start_agent_stream');
		expect(Object.keys(args)).toEqual(['channel']);
		args.channel.onmessage(JSON.stringify({
			type: 'agent_run_gate_recorded', run_id: 'run-1', work_order_id: 'wo-1',
			gate: 'g3', outcome: 'fail'
		}));
		expect(receive).toHaveBeenLastCalledWith(expect.objectContaining({
			event: { kind: 'gate', run_id: 'run-1', work_order_id: 'wo-1', gate: 'g3', outcome: 'fail' }
		}));
		agentApi.disconnectAgentStream();
		expect(invoke).toHaveBeenLastCalledWith('stop_agent_stream', { channelId: 42 });
		args.channel.onmessage(JSON.stringify({ type: 'agent_run_gate_recorded', run_id: 'x', work_order_id: 'x', gate: 'g3', outcome: 'pass' }));
		expect(receive).toHaveBeenCalledTimes(2);
		unsubscribe();
	});

	it('reconnects once after native disconnect and stops retrying on teardown', () => {
		vi.useFakeTimers();
		vi.stubGlobal('location', { protocol: 'tauri:', hostname: 'localhost' });
		isTauri.mockReturnValue(true);
		agentApi.connectAgentStream();
		const oldChannel = invoke.mock.calls[0][1].channel;
		oldChannel.onmessage(null);
		oldChannel.onmessage(null);
		vi.advanceTimersByTime(5000);
		const starts = () => invoke.mock.calls.filter(([command]) => command === 'start_agent_stream');
		expect(starts()).toHaveLength(2);
		starts()[1][1].channel.onmessage(null);
		agentApi.disconnectAgentStream();
		vi.advanceTimersByTime(5000);
		expect(starts()).toHaveLength(2);
	});

	it('calls versioned agent context endpoint', async () => {
		fetchJsonMock.mockResolvedValueOnce({
			executive_summary: 'summary',
			related_nodes: []
		});

		await agentApi.fetchAgentContext('node-1');

		expect(fetchJsonMock).toHaveBeenCalledWith('/api/v1/agent/context?basis_node_id=node-1');
	});

	it('calls versioned intent endpoints', async () => {
		fetchJsonMock.mockResolvedValue([] as CapturedIntent[]);

		await agentApi.fetchIntents();
		await agentApi.fetchIntents('node-1', 'suggested');
		await agentApi.applyIntent('intent-1');
		await agentApi.dismissIntent('intent-2');

		expect(fetchJsonMock).toHaveBeenCalledWith('/api/v1/agent/intents');
		expect(fetchJsonMock).toHaveBeenCalledWith(
			'/api/v1/agent/intents?node_id=node-1&status=suggested'
		);
		expect(fetchJsonMock).toHaveBeenCalledWith('/api/v1/agent/intents/intent-1/apply', {
			method: 'POST'
		});
		expect(fetchJsonMock).toHaveBeenCalledWith('/api/v1/agent/intents/intent-2/dismiss', {
			method: 'POST'
		});
	});

	it('calls versioned proactive and models endpoints', async () => {
		fetchJsonMock
			.mockResolvedValueOnce([] as ProactiveInsight[])
			.mockResolvedValueOnce([] as ProactiveInsight[])
			.mockResolvedValueOnce({
				embedding: { provider: 'openai', model: 'text-embedding-3-small' }
			});

		await agentApi.fetchInsights();
		await agentApi.generateInsights();
		await agentApi.fetchAiModels();

		expect(fetchJsonMock).toHaveBeenCalledWith('/api/v1/proactive/insights');
		expect(fetchJsonMock).toHaveBeenCalledWith('/api/v1/proactive/generate', {
			method: 'POST'
		});
		expect(fetchJsonMock).toHaveBeenCalledWith('/api/v1/agent/models');
	});

	it('dispatches agent run transitions onto the observation store', () => {
		const seen: unknown[] = [];
		const unsub = agentApi.agentRunObservations.subscribe((value) => {
			if (value) seen.push(value);
		});

		agentApi.dispatchAgentNotification({
			type: 'agent_run_transitioned',
			run_id: 'run-1',
			work_order_id: 'wo-1',
			status: 'awaiting_approval',
			failure_class: null
		});
		agentApi.dispatchAgentNotification({
			type: 'agent_run_gate_recorded',
			run_id: 'run-1',
			work_order_id: 'wo-1',
			gate: 'g2',
			outcome: 'pass'
		});
		// Malformed payloads must not poison the store.
		agentApi.dispatchAgentNotification({ type: 'agent_run_transitioned' });

		unsub();

		expect(seen).toHaveLength(2);
		expect(seen[0]).toMatchObject({
			event: {
				kind: 'transition',
				run_id: 'run-1',
				work_order_id: 'wo-1',
				status: 'awaiting_approval',
				failure_class: null
			}
		});
		expect(seen[1]).toMatchObject({
			event: {
				kind: 'gate',
				run_id: 'run-1',
				work_order_id: 'wo-1',
				gate: 'g2',
				outcome: 'pass'
			}
		});
		expect((seen[0] as { seq: number }).seq).toBeLessThan((seen[1] as { seq: number }).seq);
	});
});
