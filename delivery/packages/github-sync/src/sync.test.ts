import { describe, expect, it } from 'vitest';
import { BrowserStore } from '@tivity/core';
import { pullIssuesToTasks, pushTasksToIssues, type GitHubIssue, type IssuesClient, type PushClient } from './sync';

function fakeClient(issues: GitHubIssue[]): IssuesClient {
  return { listIssues: async () => issues };
}

describe('pullIssuesToTasks', () => {
  it('creates tasks + refs once, skips on re-pull', async () => {
    const store = new BrowserStore();
    const p = await store.createProject({ name: 'S1' });
    const client = fakeClient([
      { number: 1, title: 'Bug', state: 'open', body: '', url: 'u1' },
      { number: 2, title: 'Feat', state: 'closed', body: '', url: 'u2' },
    ]);
    const r1 = await pullIssuesToTasks(store, client, p.id, 'octo', 'repo');
    expect(r1.created).toBe(2);
    expect(r1.skipped).toBe(0);
    expect(typeof r1.cursor).toBe('string');
    expect(await store.listTasks(p.id)).toHaveLength(2);
    const r2 = await pullIssuesToTasks(store, client, p.id, 'octo', 'repo');
    expect(r2.created).toBe(0);
    expect(r2.skipped).toBe(2);
    expect(await store.listTasks(p.id)).toHaveLength(2);
    expect((await store.getSyncState('github:octo/repo'))?.cursor).toBe(r2.cursor);
    const mem = await store.listMemory(p.id);
    expect(mem.some((m) => m.kind === 'sync' && m.content.includes('octo/repo'))).toBe(true);
  });

  it('picks up only new issues on later pulls', async () => {
    const store = new BrowserStore();
    const p = await store.createProject({ name: 'S2' });
    await pullIssuesToTasks(
      store,
      fakeClient([{ number: 1, title: 'Old', state: 'open', body: '', url: 'u1' }]),
      p.id, 'octo', 'repo',
    );
    const r = await pullIssuesToTasks(
      store,
      fakeClient([
        { number: 1, title: 'Old', state: 'open', body: '', url: 'u1' },
        { number: 3, title: 'New', state: 'open', body: '', url: 'u3' },
      ]),
      p.id, 'octo', 'repo',
    );
    expect(r.created).toBe(1);
    expect(r.skipped).toBe(1);
  });

  it('marks pulled closed issues done and seeds the push cursor', async () => {
    const store = new BrowserStore();
    const p = await store.createProject({ name: 'S3' });
    await pullIssuesToTasks(
      store,
      fakeClient([{ number: 7, title: 'Old', state: 'closed', body: '', url: 'u7' }]),
      p.id, 'octo', 'repo',
    );
    const tasks = await store.listTasks(p.id);
    expect(tasks[0].status).toBe('done');
    expect((await store.getSyncState(`push:${tasks[0].id}`))?.cursor).toBe('closed');
  });
});

describe('pushTasksToIssues', () => {
  function fakePush(opts: { failOn?: string; nextNumber?: number } = {}): PushClient & { calls: { created: number; updated: Array<{ number: number; state: string }> } } {
    const calls = { created: 0, updated: [] as Array<{ number: number; state: string }> };
    let next = opts.nextNumber ?? 100;
    return {
      calls,
      async createIssue(_o: string, _r: string, input: { title: string; body: string }) {
        if (opts.failOn === input.title) throw new Error('boom');
        calls.created += 1;
        const number = next;
        next += 1;
        return { number };
      },
      async updateIssue(_o: string, _r: string, number: number, input: { state: 'open' | 'closed' }) {
        calls.updated.push({ number, state: input.state });
      },
    };
  }

  it('creates missing issues, closes done ones, skips on re-push', async () => {
    const store = new BrowserStore();
    const p = await store.createProject({ name: 'P1' });
    await store.createTask(p.id, 'Todo item');
    const done = await store.createTask(p.id, 'Done item');
    await store.setTaskStatus(done.id, 'done');
    const client = fakePush();
    const r1 = await pushTasksToIssues(store, client, p.id, 'octo', 'repo');
    expect(r1).toEqual({ created: 2, updated: 0, skipped: 0, errors: [] });
    expect(client.calls.created).toBe(2);
    expect(client.calls.updated).toEqual([{ number: 101, state: 'closed' }]);
    const r2 = await pushTasksToIssues(store, client, p.id, 'octo', 'repo');
    expect(r2).toEqual({ created: 0, updated: 0, skipped: 2, errors: [] });
    expect(client.calls.created).toBe(2);
  });

  it('updates drifted tasks and tolerates per-item failures', async () => {
    const store = new BrowserStore();
    const p = await store.createProject({ name: 'P2' });
    const t = await store.createTask(p.id, 'Shipped');
    await store.addExternalRef(p.id, { entityKind: 'task', entityId: t.id, service: 'github', externalId: 'octo/repo#9' });
    await store.setSyncState(p.id, `push:${t.id}`, 'open');
    await store.setTaskStatus(t.id, 'done');
    await store.createTask(p.id, 'Bad ref');
    const tasks = await store.listTasks(p.id);
    const bad = tasks.find((x) => x.title === 'Bad ref')!;
    await store.addExternalRef(p.id, { entityKind: 'task', entityId: bad.id, service: 'github', externalId: 'garbage' });
    await store.createTask(p.id, 'Explodes');
    const client = fakePush({ failOn: 'Explodes' });
    // 'Explodes' has no ref so createIssue throws for it.
    const r = await pushTasksToIssues(store, client, p.id, 'octo', 'repo');
    expect(r.created).toBe(0);
    expect(r.updated).toBe(1);
    expect(r.skipped).toBe(0);
    expect(r.errors).toHaveLength(2);
    expect(client.calls.updated).toEqual([{ number: 9, state: 'closed' }]);
    expect((await store.getSyncState(`push:${t.id}`))?.cursor).toBe('closed');
  });
});
