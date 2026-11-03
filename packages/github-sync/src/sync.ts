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

const ThrottledOctokit = Octokit.plugin(retry, throttling);

export function createOctokitClient(token: string): IssuesClient {
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
    await store.addExternalRef(projectId, {
      entityKind: 'task',
      entityId: task.id,
      service: 'github',
      externalId,
    });
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
