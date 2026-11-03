import { describe, expect, it } from 'vitest';
import { BrowserStore } from '@tivity/core';
import { pullIssuesToTasks, type GitHubIssue, type IssuesClient } from './sync';

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
});
