import { describe, expect, it } from 'vitest';
import { BrowserStore } from './store';

describe('requirements + propagation', () => {
  it('creates v1 without queue rows, v2 propagates to linked items', async () => {
    const store = new BrowserStore();
    const p = await store.createProject({ name: 'P1' });
    const req = await store.createRequirement(p.id, { title: 'R1', body: 'b1' });
    expect(req.currentVersion).toBe(1);
    expect(await store.listImpact(p.id)).toEqual([]);
    const t = await store.createTask(p.id, 'T1');
    const d = await store.createDoc(p.id, 'D1');
    await store.addLink(p.id, { fromKind: 'requirement', fromId: req.id, toKind: 'task', toId: t.id, relation: 'drives' });
    await store.addLink(p.id, { fromKind: 'task', fromId: t.id, toKind: 'doc', toId: d.id, relation: 'documents' });
    const v2 = await store.addRequirementVersion(req.id, { body: 'b2' });
    expect(v2.version).toBe(2);
    const queue = await store.listImpact(p.id);
    expect(queue.map((q) => `${q.entityKind}:${q.entityId}`).sort()).toEqual(
      [`doc:${d.id}`, `task:${t.id}`].sort(),
    );
    expect(queue.every((q) => q.status === 'pending')).toBe(true);
    await store.resolveImpact(queue[0].id, 'accepted');
    const rest = await store.listImpact(p.id);
    expect(rest.filter((q) => q.status === 'pending')).toHaveLength(1);
  });

  it('records evidence and auto-memory with why context', async () => {
    const store = new BrowserStore();
    const p = await store.createProject({ name: 'P2' });
    const ev = await store.addEvidence(p.id, { title: 'E1', source: 'S', detail: 'D' });
    expect(ev.title).toBe('E1');
    const req = await store.createRequirement(p.id, { title: 'R2' });
    await store.addLink(p.id, { fromKind: 'evidence', fromId: ev.id, toKind: 'requirement', toId: req.id, relation: 'justifies' });
    const mem = await store.listMemory(p.id);
    expect(mem.some((m) => m.kind === 'requirement' && m.content.includes('R2'))).toBe(true);
  });

  it('rejects versions for unknown requirements', async () => {
    const store = new BrowserStore();
    await expect(store.addRequirementVersion('missing', { body: 'x' })).rejects.toThrow();
  });
});

describe('delivery + external refs', () => {
  it('runs sprint → task → PR → release chain with links', async () => {
    const store = new BrowserStore();
    const p = await store.createProject({ name: 'D1' });
    const s = await store.createSprint(p.id, { name: 'S1' });
    expect(s.status).toBe('planned');
    await store.setSprintStatus(s.id, 'active');
    const t = await store.createTask(p.id, 'T1');
    await store.addLink(p.id, { fromKind: 'task', fromId: t.id, toKind: 'sprint', toId: s.id, relation: 'partOf' });
    const pr = await store.createPullRequest(p.id, { title: 'PR1', branch: 'feat/x' });
    await store.addLink(p.id, { fromKind: 'task', fromId: t.id, toKind: 'pull_request', toId: pr.id, relation: 'closedBy' });
    const r = await store.createRelease(p.id, { name: 'v0.1' });
    await store.addLink(p.id, { fromKind: 'pull_request', fromId: pr.id, toKind: 'release', toId: r.id, relation: 'shipsIn' });
    expect(await store.listLinks(p.id)).toHaveLength(3);
    await store.setPullRequestStatus(pr.id, 'merged');
    const mem = await store.listMemory(p.id);
    expect(mem.some((m) => m.kind === 'delivery')).toBe(true);
  });

  it('roundtrips external refs and sync state', async () => {
    const store = new BrowserStore();
    const p = await store.createProject({ name: 'D2' });
    const t = await store.createTask(p.id, 'T1');
    const ref = await store.addExternalRef(p.id, { entityKind: 'task', entityId: t.id, service: 'github', externalId: 'octo/repo#42' });
    expect(ref.externalId).toBe('octo/repo#42');
    expect(await store.getSyncState(`github:${p.id}`)).toBeNull();
    await store.setSyncState(p.id, `github:${p.id}`, 'cursor-1');
    expect((await store.getSyncState(`github:${p.id}`))?.cursor).toBe('cursor-1');
  });
});

describe('design registry', () => {
  it('links screens, components and requirements through the map', async () => {
    const store = new BrowserStore();
    const p = await store.createProject({ name: 'G1' });
    const home = await store.createScreen(p.id, { name: 'Home', route: '/' });
    const settings = await store.createScreen(p.id, { name: 'Settings', route: '/settings' });
    const nav = await store.createComponent(p.id, { name: 'NavBar', kind: 'layout' });
    await store.addLink(p.id, { fromKind: 'screen', fromId: home.id, toKind: 'component', toId: nav.id, relation: 'contains' });
    await store.addLink(p.id, { fromKind: 'screen', fromId: home.id, toKind: 'screen', toId: settings.id, relation: 'navigatesTo' });
    const req = await store.createRequirement(p.id, { title: 'R1' });
    await store.addLink(p.id, { fromKind: 'requirement', fromId: req.id, toKind: 'screen', toId: home.id, relation: 'realizedBy' });
    await store.addRequirementVersion(req.id, { body: 'v2' });
    const queued = (await store.listImpact(p.id)).map((q) => `${q.entityKind}:${q.entityId}`);
    expect(queued).toContain(`screen:${home.id}`);
    expect(queued).toContain(`component:${nav.id}`);
    expect(queued).toContain(`screen:${settings.id}`);
  });
});

describe('quality + security + monitoring', () => {
  it('records runs, gates, findings and checks with history', async () => {
    const store = new BrowserStore();
    const p = await store.createProject({ name: 'Q1' });
    const tc = await store.createTestCase(p.id, 'Login flow');
    expect(tc.status).toBe('not-run');
    await store.recordTestRun(tc.id, { status: 'fail', note: 'flaky' });
    await store.recordTestRun(tc.id, { status: 'pass' });
    const runs = await store.listTestRuns(tc.id);
    expect(runs).toHaveLength(2);
    expect(runs[0].status).toBe('pass');
    const cases = await store.listTestCases(p.id);
    expect(cases[0].status).toBe('pass');
    const gate = await store.createQualityGate(p.id, 'coverage>80');
    await store.setQualityGateStatus(gate.id, 'pass');
    const finding = await store.createSecurityFinding(p.id, { title: 'XSS in notes', severity: 'high' });
    await store.setSecurityFindingStatus(finding.id, 'fixed');
    const check = await store.createMonitorCheck(p.id, 'api latency');
    await store.setMonitorCheckStatus(check.id, 'passing', 'p99 180ms');
    const mem = await store.listMemory(p.id);
    expect(mem.some((m) => m.kind === 'quality' && m.content.includes('Login flow'))).toBe(true);
    expect(mem.some((m) => m.content.includes('XSS in notes'))).toBe(true);
  });

  it('rejects runs for unknown test cases', async () => {
    const store = new BrowserStore();
    await expect(store.recordTestRun('missing', { status: 'pass' })).rejects.toThrow();
  });
});

describe('agents + runs + jobs ledger', () => {
  it('registers agents and audits runs', async () => {
    const store = new BrowserStore();
    const p = await store.createProject({ name: 'J1' });
    const a = await store.registerAgent(p.id, { name: 'HK', role: 'maint', model: 'local' });
    expect(a.status).toBe('active');
    await store.setAgentStatus(a.id, 'paused');
    expect((await store.listAgents(p.id))[0].status).toBe('paused');
    const run = await store.startAgentRun(p.id, { agentId: a.id, summary: 'begin' });
    expect(run.status).toBe('running');
    await store.finishAgentRun(run.id, { status: 'done', summary: 'ok' });
    const runs = await store.listAgentRuns(p.id);
    expect(runs[0].status).toBe('done');
    expect(runs[0].finishedAt).not.toBeNull();
  });

  it('enqueues, claims, completes and requeues jobs', async () => {
    const store = new BrowserStore();
    const p = await store.createProject({ name: 'J2' });
    const t0 = Date.now();
    const job = await store.enqueueJob(p.id, { type: 'housekeeping', payload: '{"a":1}' });
    expect(job.status).toBe('queued');
    const claimed = await store.claimDueJob(p.id, t0);
    expect(claimed?.id).toBe(job.id);
    expect(claimed?.attempts).toBe(1);
    await store.completeJob(job.id, 'done', 'ok');
    expect((await store.listJobs(p.id))[0].status).toBe('done');
    const retry = await store.enqueueJob(p.id, { type: 'flaky' });
    await store.claimDueJob(p.id, t0);
    await store.requeueJob(retry.id, t0 + 5_000);
    expect(await store.claimDueJob(p.id, t0 + 1_000)).toBeNull();
    const again = await store.claimDueJob(p.id, t0 + 6_000);
    expect(again?.id).toBe(retry.id);
    expect(again?.attempts).toBe(2);
  });
});
