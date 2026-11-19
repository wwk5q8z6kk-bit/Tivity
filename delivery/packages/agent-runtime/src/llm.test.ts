import { describe, expect, it } from 'vitest';
import { BrowserStore } from '@tivity/core';
import { buildAgent, buildAgentTools } from './llm';
import { resolveModelConfig } from './llm-core';
import { executeAgentTask } from './llm-handler';

// Hermetic: tools run against a local store, generation is injected.
// The live-model path is proven by throwaway probe, never committed tests.

describe('agent tools', () => {
  it('lists open tasks, reads linked context, records notes', async () => {
    const store = new BrowserStore();
    const p = await store.createProject({ name: 'L1' });
    await store.createTask(p.id, 'Open one');
    const done = await store.createTask(p.id, 'Done one');
    await store.setTaskStatus(done.id, 'done');
    const req = await store.createRequirement(p.id, { title: 'R1' });
    const open = (await store.listTasks(p.id)).find((t) => t.title === 'Open one')!;
    await store.addLink(p.id, { fromKind: 'requirement', fromId: req.id, toKind: 'task', toId: open.id, relation: 'drives' });

    const tools = buildAgentTools(store, p.id);
    // Inputs are valid here, so ValidationError branches are unreachable;
    // the casts keep the test focused on tool behavior, not the union.
    const listed = (await tools.listOpenTasks.execute?.({}, {})) as { tasks: Array<{ title: string }> } | undefined;
    expect(listed?.tasks.map((t) => t.title)).toEqual(['Open one']);

    const ctx = (await tools.readTaskContext.execute?.({ taskId: open.id }, {})) as
      | { title: string; linked: Array<{ kind: string; title: string; relation: string }> }
      | undefined;
    expect(ctx?.title).toBe('Open one');
    expect(ctx?.linked).toEqual([{ kind: 'requirement', title: 'R1', relation: 'drives' }]);

    const note = (await tools.recordNote.execute?.({ content: 'hello' }, {})) as { id: string } | undefined;
    expect(typeof note?.id).toBe('string');
    const mem = await store.listMemory(p.id);
    expect(mem).toHaveLength(2); // requirement auto-note + the recorded note
    expect(mem.some((m) => m.kind === 'agent' && m.content === 'hello')).toBe(true);
  });

  it('resolves model config with ollama-local defaults', () => {
    expect(resolveModelConfig({})).toEqual({
      provider: 'ollama',
      model: 'qwen2.5-coder:7b',
      baseURL: 'http://localhost:11434/v1',
      hasKey: true,
    });
    expect(resolveModelConfig({ TIVITY_MODEL_PROVIDER: 'openai' }).hasKey).toBe(false);
    expect(resolveModelConfig({ TIVITY_MODEL_PROVIDER: 'openai', OPENAI_API_KEY: 'x' }).hasKey).toBe(true);
  });

  it('constructs an agent around injected model and tools', () => {
    const store = new BrowserStore();
    const agent = buildAgent({} as never, buildAgentTools(store, 'p'));
    expect(agent.name).toBe('Tivity');
    expect(typeof agent.generate).toBe('function');
  });
});

describe('executeAgentTask', () => {
  it('writes the answer to memory and summarizes the run', async () => {
    const store = new BrowserStore();
    const p = await store.createProject({ name: 'L2' });
    const t = await store.createTask(p.id, 'Ship it');
    const job = await store.enqueueJob(p.id, { type: 'agent-task', payload: JSON.stringify({ taskId: t.id, goal: 'Plan it.' }) });
    const out = await executeAgentTask(store, p.id, job, async (prompt) => {
      expect(prompt).toContain('Ship it');
      expect(prompt).toContain('Plan it.');
      return 'Do A, then B.';
    });
    expect(out.summary).toContain('Ship it');
    const mem = await store.listMemory(p.id);
    expect(mem.some((m) => m.kind === 'agent' && m.content.includes('Do A, then B.'))).toBe(true);
  });

  it('rejects bad payloads and unknown tasks', async () => {
    const store = new BrowserStore();
    const p = await store.createProject({ name: 'L3' });
    const bad = await store.enqueueJob(p.id, { type: 'agent-task', payload: 'not-json' });
    await expect(executeAgentTask(store, p.id, bad, async () => 'x')).rejects.toThrow('not JSON');
    const missing = await store.enqueueJob(p.id, { type: 'agent-task', payload: JSON.stringify({ taskId: 'nope' }) });
    await expect(executeAgentTask(store, p.id, missing, async () => 'x')).rejects.toThrow('task not found');
  });
});
