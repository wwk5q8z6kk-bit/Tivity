import { describe, expect, it } from 'vitest';
import { BrowserStore } from '@tivity/core';
import { localHandlers } from './handlers';
import { runDueJobs } from './runner';

describe('runDueJobs', () => {
  it('leases, runs, audits and writes memory', async () => {
    const store = new BrowserStore();
    const p = await store.createProject({ name: 'A1' });
    const agent = await store.registerAgent(p.id, { name: 'HK', model: 'local-handlers' });
    await store.createTask(p.id, 'T1');
    await store.enqueueJob(p.id, { type: 'housekeeping' });
    const out = await runDueJobs(store, p.id, agent.id, localHandlers, Date.now());
    expect(out).toEqual({ ran: 1, failed: 0 });
    const jobs = await store.listJobs(p.id);
    expect(jobs[0].status).toBe('done');
    expect(jobs[0].attempts).toBe(1);
    const runs = await store.listAgentRuns(p.id);
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('done');
    expect(runs[0].agentId).toBe(agent.id);
    const mem = await store.listMemory(p.id);
    expect(mem.some((m) => m.kind === 'agent' && m.content.includes('1 open tasks'))).toBe(true);
    // Queue drained: second pass is a no-op.
    expect(await runDueJobs(store, p.id, agent.id, localHandlers, Date.now())).toEqual({ ran: 0, failed: 0 });
  });

  it('requeues failures with backoff, then marks failed', async () => {
    const store = new BrowserStore();
    const p = await store.createProject({ name: 'A2' });
    const agent = await store.registerAgent(p.id, { name: 'HK' });
    await store.enqueueJob(p.id, { type: 'no-such-handler' });
    const t0 = Date.now();
    // Attempt 1: fails, requeued for t0+30s.
    expect(await runDueJobs(store, p.id, agent.id, localHandlers, t0)).toEqual({ ran: 0, failed: 1 });
    // Not due yet.
    expect(await runDueJobs(store, p.id, agent.id, localHandlers, t0 + 1_000)).toEqual({ ran: 0, failed: 0 });
    // Attempt 2: fails, requeued for +60s.
    expect(await runDueJobs(store, p.id, agent.id, localHandlers, t0 + 31_000)).toEqual({ ran: 0, failed: 1 });
    // Attempt 3: fails permanently.
    expect(await runDueJobs(store, p.id, agent.id, localHandlers, t0 + 91_000)).toEqual({ ran: 0, failed: 1 });
    const jobs = await store.listJobs(p.id);
    expect(jobs[0].status).toBe('failed');
    expect(jobs[0].attempts).toBe(3);
    const runs = await store.listAgentRuns(p.id);
    expect(runs).toHaveLength(3);
    expect(runs.every((r) => r.status === 'failed')).toBe(true);
  });

  it('a leased job is invisible to a second claim', async () => {
    const store = new BrowserStore();
    const p = await store.createProject({ name: 'A3' });
    await store.enqueueJob(p.id, { type: 'housekeeping' });
    const t0 = Date.now();
    const first = await store.claimDueJob(p.id, t0);
    expect(first?.status).toBe('running');
    expect(first?.attempts).toBe(1);
    expect(await store.claimDueJob(p.id, t0)).toBeNull();
  });

  it('impact-nudge reports the pending queue', async () => {
    const store = new BrowserStore();
    const p = await store.createProject({ name: 'A4' });
    const agent = await store.registerAgent(p.id, { name: 'HK' });
    const req = await store.createRequirement(p.id, { title: 'R1' });
    const t = await store.createTask(p.id, 'T1');
    await store.addLink(p.id, { fromKind: 'requirement', fromId: req.id, toKind: 'task', toId: t.id, relation: 'drives' });
    await store.addRequirementVersion(req.id, { body: 'v2' });
    await store.enqueueJob(p.id, { type: 'impact-nudge' });
    await runDueJobs(store, p.id, agent.id, localHandlers, Date.now());
    const mem = await store.listMemory(p.id);
    expect(mem.some((m) => m.kind === 'agent' && m.content.includes('1 waiting for review'))).toBe(true);
  });
});
