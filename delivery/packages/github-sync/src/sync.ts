import { Octokit } from '@octokit/rest';
import { retry } from '@octokit/plugin-retry';
import { throttling } from '@octokit/plugin-throttling';
import type { Store } from '@tivity/core';

// Pull-only GitHub sync v0: issues become linked tasks. The Octokit client is
// injected behind IssuesClient so tests never touch the network.

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  body: string;
  url: string;
}

export interface IssuesClient {
  listIssues(owner: string, repo: string): Promise<GitHubIssue[]>;
}

export interface PushClient {
  createIssue(owner: string, repo: string, input: { title: string; body: string }): Promise<{ number: number }>;
  updateIssue(owner: string, repo: string, number: number, input: { state: 'open' | 'closed' }): Promise<void>;
}

const ThrottledOctokit = Octokit.plugin(retry, throttling);

export function createOctokitClient(token: string): IssuesClient & PushClient {
  const octokit = new ThrottledOctokit({
    auth: token,
    throttle: {
      onRateLimit: () => true,
      onSecondaryRateLimit: () => true,
    },
  });
  return {
    async listIssues(owner: string, repo: string): Promise<GitHubIssue[]> {
      const items = await octokit.paginate(octokit.rest.issues.listForRepo, {
        owner,
        repo,
        state: 'all',
        per_page: 100,
      });
      return items
        .filter((it) => !('pull_request' in it))
        .map((it) => ({
          number: it.number,
          title: it.title,
          state: it.state,
          body: it.body ?? '',
          url: it.html_url,
        }));
    },
    async createIssue(owner: string, repo: string, input: { title: string; body: string }): Promise<{ number: number }> {
      const res = await octokit.rest.issues.create({ owner, repo, title: input.title, body: input.body });
      return { number: res.data.number };
    },
    async updateIssue(owner: string, repo: string, number: number, input: { state: 'open' | 'closed' }): Promise<void> {
      await octokit.rest.issues.update({ owner, repo, issue_number: number, state: input.state });
    },
  };
}

export interface PullResult {
  created: number;
  skipped: number;
  cursor: string;
}

export async function pullIssuesToTasks(
  store: Store,
  client: IssuesClient,
  projectId: string,
  owner: string,
  repo: string,
): Promise<PullResult> {
  const issues = await client.listIssues(owner, repo);
  const refs = await store.listExternalRefs(projectId);
  const known = new Set(
    refs.filter((r) => r.service === 'github').map((r) => r.externalId),
  );
  let created = 0;
  let skipped = 0;
  for (const issue of issues) {
    const externalId = `${owner}/${repo}#${issue.number}`;
    if (known.has(externalId)) {
      skipped += 1;
      continue;
    }
    const task = await store.createTask(projectId, `[#${issue.number}] ${issue.title}`);
    const issueState = issue.state === 'closed' ? 'closed' : 'open';
    if (issueState === 'closed') await store.setTaskStatus(task.id, 'done');
    await store.addExternalRef(projectId, {
      entityKind: 'task',
      entityId: task.id,
      service: 'github',
      externalId,
    });
    // Seed the push cursor so the next push skips already-matching tasks.
    await store.setSyncState(projectId, `push:${task.id}`, issueState);
    known.add(externalId);
    created += 1;
  }
  const cursor = new Date().toISOString();
  await store.setSyncState(projectId, `github:${owner}/${repo}`, cursor);
  await store.appendMemory(
    projectId,
    'sync',
    `Pulled ${owner}/${repo}: ${created} new, ${skipped} already linked.`,
  );
  return { created, skipped, cursor };
}

export interface PushResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

// Tivity-wins push: tasks without a github ref become issues; linked tasks
// update only when local status drifted from the per-task push cursor.
// Per-item failures are collected, never aborting the push.
export async function pushTasksToIssues(
  store: Store,
  client: PushClient,
  projectId: string,
  owner: string,
  repo: string,
): Promise<PushResult> {
  const [tasks, refs] = await Promise.all([
    store.listTasks(projectId),
    store.listExternalRefs(projectId),
  ]);
  const byTask = new Map(
    refs
      .filter((r) => r.service === 'github' && r.entityKind === 'task')
      .map((r) => [r.entityId, r.externalId]),
  );
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const task of tasks) {
    const ref = byTask.get(task.id);
    const wantState = task.status === 'done' ? 'closed' : 'open';
    try {
      if (!ref) {
        const issue = await client.createIssue(owner, repo, {
          title: task.title,
          body: `Synced from Tivity task ${task.id}.`,
        });
        await store.addExternalRef(projectId, {
          entityKind: 'task',
          entityId: task.id,
          service: 'github',
          externalId: `${owner}/${repo}#${issue.number}`,
        });
        if (wantState === 'closed') {
          await client.updateIssue(owner, repo, issue.number, { state: 'closed' });
        }
        await store.setSyncState(projectId, `push:${task.id}`, wantState);
        created += 1;
      } else {
        const cursor = await store.getSyncState(`push:${task.id}`);
        if (cursor?.cursor === wantState) {
          skipped += 1;
          continue;
        }
        const number = parseInt(ref.split('#')[1] ?? '', 10);
        if (!Number.isFinite(number)) {
          errors.push(`${task.title}: bad ref ${ref}`);
          continue;
        }
        await client.updateIssue(owner, repo, number, { state: wantState });
        await store.setSyncState(projectId, `push:${task.id}`, wantState);
        updated += 1;
      }
    } catch (err) {
      errors.push(`${task.title}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  await store.appendMemory(
    projectId,
    'sync',
    `Pushed to ${owner}/${repo}: ${created} created, ${updated} updated, ${skipped} unchanged, ${errors.length} errors.`,
  );
  return { created, updated, skipped, errors };
}
