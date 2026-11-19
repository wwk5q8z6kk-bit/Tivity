import type { Store } from '@tivity/core';
import {
  createTaskOp,
  formatHits,
  impactOp,
  openIdeStore,
  recordMemoryOp,
  searchOp,
  tasksOp,
} from '@tivity/ide-client';

// Command logic with the vscode API injected as IdeUi, so tests drive every
// flow with fakes. extension.ts is the thin real-vscode adapter. Cancel
// (undefined) returns silently; empty input and op failures surface as
// explicit error messages — never silent, never invented.

export interface IdeUi {
  showInput(prompt: string, placeholder?: string): Promise<string | undefined>;
  showPick(items: string[], prompt: string): Promise<string | undefined>;
  showInfo(message: string): Promise<void>;
  showError(message: string): Promise<void>;
}

export interface IdeConfig {
  dbPath: string;
  project: string;
}

export type StoreOpener = (dbPath?: string) => Promise<{ store: Store; close: () => void }>;

async function withStore<T>(
  ui: IdeUi,
  config: IdeConfig,
  open: StoreOpener,
  run: (store: Store, project: string | undefined) => Promise<T>,
): Promise<T | undefined> {
  let handle: { store: Store; close: () => void } | undefined;
  try {
    handle = await open(config.dbPath.trim() || undefined);
    const project = config.project.trim() || undefined;
    return await run(handle.store, project);
  } catch (err) {
    await ui.showError(err instanceof Error ? err.message : String(err));
    return undefined;
  } finally {
    handle?.close();
  }
}

export async function searchCommand(
  ui: IdeUi,
  config: IdeConfig,
  open: StoreOpener = openIdeStore,
): Promise<void> {
  const query = await ui.showInput('Search docs, memory, and tasks', 'quarterly report');
  if (query === undefined) return;
  await withStore(ui, config, open, async (store, project) => {
    const hits = await searchOp(store, project, query);
    if (hits.length === 0) {
      await ui.showInfo('No matches.');
      return;
    }
    const pick = await ui.showPick(
      hits.map((h) => `(${h.kind}) ${h.title}`),
      `${hits.length} matches`,
    );
    if (pick !== undefined) await ui.showInfo(formatHits(hits.filter((h) => pick.includes(h.title))));
  });
}

const STATUS_PICKS = ['all', 'todo', 'doing', 'done'] as const;

export async function listTasksCommand(
  ui: IdeUi,
  config: IdeConfig,
  open: StoreOpener = openIdeStore,
): Promise<void> {
  const status = await ui.showPick([...STATUS_PICKS], 'Filter by status');
  if (status === undefined) return;
  await withStore(ui, config, open, async (store, project) => {
    const tasks = await tasksOp(store, project, status === 'all' ? '' : status);
    if (tasks.length === 0) {
      await ui.showInfo('No tasks.');
      return;
    }
    await ui.showPick(
      tasks.map((t) => `[${t.status}] ${t.title}`),
      `${tasks.length} tasks`,
    );
  });
}

export async function createTaskCommand(
  ui: IdeUi,
  config: IdeConfig,
  open: StoreOpener = openIdeStore,
): Promise<void> {
  const title = await ui.showInput('Task title', 'Wire the login form');
  if (title === undefined) return;
  if (title.trim().length === 0) {
    await ui.showError('Task title must not be empty.');
    return;
  }
  await withStore(ui, config, open, async (store, project) => {
    const task = await createTaskOp(store, project, title);
    await ui.showInfo(`Created: ${task.title}`);
  });
}

export async function recordMemoryCommand(
  ui: IdeUi,
  config: IdeConfig,
  open: StoreOpener = openIdeStore,
): Promise<void> {
  const kind = await ui.showInput('Memory kind', 'note');
  if (kind === undefined) return;
  const content = await ui.showInput('Memory content', 'Chose X because Y');
  if (content === undefined) return;
  if (content.trim().length === 0) {
    await ui.showError('Memory content must not be empty.');
    return;
  }
  await withStore(ui, config, open, async (store, project) => {
    const entry = await recordMemoryOp(store, project, kind, content);
    await ui.showInfo(`Recorded ${entry.kind} memory.`);
  });
}

export async function showImpactCommand(
  ui: IdeUi,
  config: IdeConfig,
  open: StoreOpener = openIdeStore,
): Promise<void> {
  await withStore(ui, config, open, async (store, project) => {
    const items = await impactOp(store, project, false);
    if (items.length === 0) {
      await ui.showInfo('Impact queue is clear.');
      return;
    }
    await ui.showPick(
      items.map((q) => `[${q.status}] ${q.entityKind} — ${q.reason}`),
      `${items.length} awaiting review`,
    );
  });
}
