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
