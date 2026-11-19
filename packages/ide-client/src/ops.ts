import type { SearchHit, Store, Task } from '@tivity/core';

// Shared IDE-client operations over any Store. Dependency-free: the MCP
// server and the VS Code extension both call these, and tests drive them
// with a fake Store. Every failure is an explicit Error naming the fix —
// no silent fallbacks, no invented data.

export async function resolveProjectId(store: Store, ref?: string): Promise<string> {
  const projects = await store.listProjects();
  if (projects.length === 0) {
    throw new Error('No projects yet — create one in the Tivity desktop app first.');
  }
  const want = (ref ?? '').trim();
  if (!want) return projects[0].id;
  const hit = projects.find((p) => p.id === want)
    ?? projects.find((p) => p.name.toLowerCase() === want.toLowerCase());
  if (!hit) {
    throw new Error(
      `Project not found: "${ref}". Available: ${projects.map((p) => p.name).join(', ')}`,
    );
  }
  return hit.id;
}

export async function listProjectsOp(store: Store) {
  const projects = await store.listProjects();
  return projects.map((p) => ({ id: p.id, name: p.name, summary: p.summary, status: p.status }));
}

export async function searchOp(store: Store, projectRef: string | undefined, query: string): Promise<SearchHit[]> {
  if (query.trim().length === 0) throw new Error('Search query must not be empty.');
  return store.search(await resolveProjectId(store, projectRef), query);
}

const TASK_STATUSES = ['todo', 'doing', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export function parseTaskStatus(raw: string): TaskStatus {
  const s = raw.trim().toLowerCase();
  if (s === 'todo' || s === 'doing' || s === 'done') return s;
  throw new Error(`Invalid task status: "${raw}". Use todo, doing, or done.`);
}

export async function tasksOp(store: Store, projectRef: string | undefined, status?: string): Promise<Task[]> {
  const projectId = await resolveProjectId(store, projectRef);
  const tasks = await store.listTasks(projectId);
  const want = (status ?? '').trim();
  if (!want) return tasks;
  const parsed = parseTaskStatus(want);
  return tasks.filter((t) => t.status === parsed);
}

export async function createTaskOp(store: Store, projectRef: string | undefined, title: string): Promise<Task> {
  if (title.trim().length === 0) throw new Error('Task title must not be empty.');
  return store.createTask(await resolveProjectId(store, projectRef), title.trim());
}

export async function taskCommentsOp(store: Store, projectRef: string | undefined, taskId: string) {
  return store.listTaskComments(await resolveProjectId(store, projectRef), taskId);
}

export async function addTaskCommentOp(
  store: Store, projectRef: string | undefined, taskId: string, author: string, body: string,
) {
  return store.addTaskComment(await resolveProjectId(store, projectRef), taskId, { author, body });
}

export async function setTaskStatusOp(
  store: Store,
  projectRef: string | undefined,
  taskRef: string,
  status: string,
): Promise<Task> {
  const parsed = parseTaskStatus(status);
  const projectId = await resolveProjectId(store, projectRef);
  const tasks = await store.listTasks(projectId);
  const want = taskRef.trim();
  const byId = tasks.find((t) => t.id === want);
  if (byId) {
    await store.setTaskStatus(byId.id, parsed);
    return { ...byId, status: parsed };
  }
  const byTitle = tasks.filter((t) => t.title.toLowerCase() === want.toLowerCase());
  if (byTitle.length === 1) {
    await store.setTaskStatus(byTitle[0].id, parsed);
    return { ...byTitle[0], status: parsed };
  }
  if (byTitle.length > 1) {
    throw new Error(
      `Ambiguous task title "${taskRef}" (${byTitle.length} matches) — use the task id instead.`,
    );
  }
  throw new Error(`Task not found: "${taskRef}". List tasks to see ids and titles.`);
}

export async function recordMemoryOp(
  store: Store,
  projectRef: string | undefined,
  kind: string,
  content: string,
) {
  if (content.trim().length === 0) throw new Error('Memory content must not be empty.');
  const k = kind.trim() || 'note';
  return store.appendMemory(await resolveProjectId(store, projectRef), k, content.trim());
}

export async function impactOp(store: Store, projectRef: string | undefined, includeResolved: boolean) {
  const items = await store.listImpact(await resolveProjectId(store, projectRef));
  return includeResolved ? items : items.filter((q) => q.status === 'pending');
}

// Plain-text formatters for human surfaces (QuickPick details, messages).

export function formatTasks(tasks: Task[]): string {
  if (tasks.length === 0) return 'No tasks.';
  return tasks.map((t) => `[${t.status}] ${t.title} (${t.id})`).join('\n');
}

export function formatHits(hits: SearchHit[]): string {
  if (hits.length === 0) return 'No matches.';
  return hits
    .map((h) => `(${h.kind}) ${h.title}${h.snippet ? ` — ${h.snippet}` : ''}`)
    .join('\n');
}

export function formatImpact(items: Array<{ entityKind: string; entityId: string; reason: string; status: string }>): string {
  if (items.length === 0) return 'Impact queue is clear.';
  return items.map((q) => `[${q.status}] ${q.entityKind} ${q.entityId} — ${q.reason}`).join('\n');
}
