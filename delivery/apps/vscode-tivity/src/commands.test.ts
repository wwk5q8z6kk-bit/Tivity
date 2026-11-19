import { describe, expect, it } from 'vitest';
import type { Project, Store, Task } from '@tivity/core';
import {
  createTaskCommand,
  listTasksCommand,
  recordMemoryCommand,
  searchCommand,
  showImpactCommand,
  type IdeConfig,
  type IdeUi,
  type StoreOpener,
} from './commands';

interface ScriptedUi extends IdeUi {
  infos: string[];
  errors: string[];
  picksShown: string[][];
}

function scriptedUi(answers: Array<string | undefined>): ScriptedUi {
  const queue = [...answers];
  const ui: ScriptedUi = {
    infos: [],
    errors: [],
    picksShown: [],
    showInput: async () => queue.shift(),
    showPick: async (items) => {
      ui.picksShown.push(items);
      return queue.shift();
    },
    showInfo: async (message) => {
      ui.infos.push(message);
    },
    showError: async (message) => {
      ui.errors.push(message);
    },
  };
  return ui;
}

function fakeOpener(options?: { failOpen?: string; projects?: Project[]; tasks?: Task[] }): StoreOpener & {
  opened: number;
  closed: number;
  tasks: Task[];
} {
  const projects: Project[] = options?.projects ?? [
    { id: 'p1', name: 'Alpha', summary: '', status: 'active', createdAt: 1, updatedAt: 1 },
  ];
  const tasks: Task[] = options?.tasks ?? [
    { id: 't1', projectId: 'p1', title: 'Write docs', status: 'todo', createdAt: 1, updatedAt: 1 },
  ];
  const counts = { opened: 0, closed: 0 };
  const opener = (async () => {
    if (options?.failOpen) throw new Error(options.failOpen);
    counts.opened += 1;
    const store = {
      listProjects: async () => projects,
      search: async () => [{ kind: 'task' as const, id: 't1', title: 'Write docs', snippet: 'body' }],
      listTasks: async (projectId: string) => tasks.filter((t) => t.projectId === projectId),
      createTask: async (projectId: string, title: string) => {
        const t: Task = { id: 't9', projectId, title, status: 'todo', createdAt: 1, updatedAt: 1 };
        tasks.push(t);
        return t;
      },
      appendMemory: async (projectId: string, kind: string, content: string) => (
        { id: 'm1', projectId, kind, content, createdAt: 1 }
      ),
      listImpact: async () => [],
    } as unknown as Store;
    return { store, close: () => { counts.closed += 1; } };
  }) as StoreOpener & { opened: number; closed: number; tasks: Task[] };
  Object.defineProperties(opener, {
    opened: { get: () => counts.opened },
    closed: { get: () => counts.closed },
    tasks: { get: () => tasks },
  });
  return opener;
}

const CONFIG: IdeConfig = { dbPath: '', project: '' };

describe('search command', () => {
  it('shows matches and details the selection', async () => {
    const ui = scriptedUi(['docs', '(task) Write docs']);
    const open = fakeOpener();
    await searchCommand(ui, CONFIG, open);
    expect(ui.picksShown[0]).toEqual(['(task) Write docs']);
    expect(ui.infos).toEqual(['(task) Write docs — body']);
    expect(open.opened).toBe(1);
    expect(open.closed).toBe(1);
  });

  it('returns silently on cancel and never opens the database', async () => {
    const ui = scriptedUi([undefined]);
    const open = fakeOpener();
    await searchCommand(ui, CONFIG, open);
    expect(open.opened).toBe(0);
    expect(ui.errors).toEqual([]);
  });

  it('surfaces open failures as errors', async () => {
    const ui = scriptedUi(['docs']);
    await searchCommand(ui, CONFIG, fakeOpener({ failOpen: 'DB locked' }));
    expect(ui.errors).toEqual(['DB locked']);
  });
});

describe('list tasks command', () => {
  it('filters by the picked status', async () => {
    const ui = scriptedUi(['todo', undefined]);
    const open = fakeOpener();
    await listTasksCommand(ui, CONFIG, open);
    expect(ui.picksShown[0]).toEqual(['all', 'todo', 'doing', 'done']);
    expect(ui.picksShown[1]).toEqual(['[todo] Write docs']);
  });

  it('reports an empty list instead of an empty picker', async () => {
    const ui = scriptedUi(['done']);
    await listTasksCommand(ui, CONFIG, fakeOpener());
    expect(ui.infos).toEqual(['No tasks.']);
  });
});

describe('create task command', () => {
  it('creates and confirms', async () => {
    const ui = scriptedUi(['New thing']);
    const open = fakeOpener();
    await createTaskCommand(ui, CONFIG, open);
    expect(ui.infos).toEqual(['Created: New thing']);
    expect(open.tasks.map((t) => t.title)).toContain('New thing');
  });

  it('rejects empty titles without opening the database', async () => {
    const ui = scriptedUi(['   ']);
    const open = fakeOpener();
    await createTaskCommand(ui, CONFIG, open);
    expect(ui.errors).toEqual(['Task title must not be empty.']);
    expect(open.opened).toBe(0);
  });
});

describe('record memory command', () => {
  it('records kind + content', async () => {
    const ui = scriptedUi(['learning', 'x helps y']);
    await recordMemoryCommand(ui, CONFIG, fakeOpener());
    expect(ui.infos).toEqual(['Recorded learning memory.']);
  });

  it('stops silently when the second prompt is cancelled', async () => {
    const ui = scriptedUi(['note', undefined]);
    const open = fakeOpener();
    await recordMemoryCommand(ui, CONFIG, open);
    expect(open.opened).toBe(0);
    expect(ui.errors).toEqual([]);
  });
});

describe('impact command', () => {
  it('reports a clear queue', async () => {
    const ui = scriptedUi([]);
    await showImpactCommand(ui, CONFIG, fakeOpener());
    expect(ui.infos).toEqual(['Impact queue is clear.']);
  });

  it('surfaces unknown projects explicitly', async () => {
    const ui = scriptedUi([]);
    await showImpactCommand(ui, { dbPath: '', project: 'ghost' }, fakeOpener());
    expect(ui.errors[0]).toContain('Project not found');
  });
});
