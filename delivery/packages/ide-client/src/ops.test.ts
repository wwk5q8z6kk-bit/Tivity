import { describe, expect, it } from 'vitest';
import type { ImpactItem, MemoryEntry, Project, Store, Task } from '@tivity/core';
import {
  createTaskOp,
  formatHits,
  formatImpact,
  formatTasks,
  impactOp,
  listProjectsOp,
  parseTaskStatus,
  recordMemoryOp,
  resolveProjectId,
  searchOp,
  setTaskStatusOp,
  tasksOp,
} from './ops';

type FakeMethods = Pick<
  Store,
  'listProjects' | 'search' | 'listTasks' | 'createTask' | 'setTaskStatus' | 'appendMemory' | 'listImpact'
>;

function fakeStore(seed?: { projects?: Project[]; tasks?: Task[] }): Store & {
  tasks: Task[];
  memory: MemoryEntry[];
} {
  const projects: Project[] = seed?.projects ?? [
    { id: 'p1', name: 'Alpha', summary: '', status: 'active', createdAt: 1, updatedAt: 1 },
    { id: 'p2', name: 'Beta', summary: '', status: 'active', createdAt: 2, updatedAt: 2 },
  ];
  const tasks: Task[] = seed?.tasks ?? [
    { id: 't1', projectId: 'p1', title: 'Write docs', status: 'todo', createdAt: 1, updatedAt: 1 },
    { id: 't2', projectId: 'p1', title: 'Ship it', status: 'done', createdAt: 2, updatedAt: 2 },
  ];
  const memory: MemoryEntry[] = [];
  const methods: FakeMethods = {
    listProjects: async () => projects,
    search: async (projectId, query) => (query.includes('nothing') ? [] : [
      { kind: 'task' as const, id: 't1', title: 'Write docs', snippet: '' },
      ...(projectId === 'p1' ? [] : [{ kind: 'doc' as const, id: 'd9', title: 'stray', snippet: '' }]),
    ]),
    listTasks: async (projectId) => tasks.filter((t) => t.projectId === projectId),
    createTask: async (projectId, title) => {
      const t: Task = { id: `t${tasks.length + 1}`, projectId, title, status: 'todo', createdAt: 9, updatedAt: 9 };
      tasks.push(t);
      return t;
    },
    setTaskStatus: async (id, status) => {
      const t = tasks.find((x) => x.id === id);
      if (t) t.status = status;
    },
    appendMemory: async (projectId, kind, content) => {
      const m: MemoryEntry = { id: `m${memory.length + 1}`, projectId, kind, content, createdAt: 9 };
      memory.push(m);
      return m;
    },
    listImpact: async (): Promise<ImpactItem[]> => [
      { id: 'q1', projectId: 'p1', triggerKind: 'requirement', triggerId: 'r1', entityKind: 'task', entityId: 't1', reason: 'req v2', status: 'pending', createdAt: 1, resolvedAt: null },
      { id: 'q2', projectId: 'p1', triggerKind: 'requirement', triggerId: 'r1', entityKind: 'doc', entityId: 'd1', reason: 'req v2', status: 'accepted', createdAt: 2, resolvedAt: 3 },
    ],
  };
  return { tasks, memory, ...methods } as unknown as Store & { tasks: Task[]; memory: MemoryEntry[] };
}

describe('resolveProjectId', () => {
  it('defaults to the first project', async () => {
    await expect(resolveProjectId(fakeStore())).resolves.toBe('p1');
    await expect(resolveProjectId(fakeStore(), '  ')).resolves.toBe('p1');
  });

  it('matches by id or case-insensitive name', async () => {
    const s = fakeStore();
    await expect(resolveProjectId(s, 'p2')).resolves.toBe('p2');
    await expect(resolveProjectId(s, 'beta')).resolves.toBe('p2');
  });

  it('throws naming the available projects', async () => {
    await expect(resolveProjectId(fakeStore(), 'nope')).rejects.toThrow('Alpha, Beta');
  });

  it('throws a clear error when no projects exist', async () => {
    const s = fakeStore({ projects: [] });
    await expect(resolveProjectId(s)).rejects.toThrow('No projects yet');
  });
});

describe('ops', () => {
  it('lists projects with identity fields', async () => {
    const rows = await listProjectsOp(fakeStore());
    expect(rows).toEqual([
      { id: 'p1', name: 'Alpha', summary: '', status: 'active' },
      { id: 'p2', name: 'Beta', summary: '', status: 'active' },
    ]);
  });

  it('rejects empty search queries', async () => {
    await expect(searchOp(fakeStore(), undefined, '  ')).rejects.toThrow('must not be empty');
  });

  it('searches within the resolved project', async () => {
    const hits = await searchOp(fakeStore(), 'Alpha', 'docs');
    expect(hits.map((h) => h.id)).toEqual(['t1']);
    await expect(searchOp(fakeStore(), undefined, 'nothing here')).resolves.toEqual([]);
  });

  it('filters tasks by status and rejects bad statuses', async () => {
    const s = fakeStore();
    expect((await tasksOp(s, undefined)).map((t) => t.id)).toEqual(['t1', 't2']);
    expect((await tasksOp(s, undefined, 'done')).map((t) => t.id)).toEqual(['t2']);
    await expect(tasksOp(s, undefined, 'bogus')).rejects.toThrow('Invalid task status');
    expect(parseTaskStatus(' Doing ')).toBe('doing');
  });

  it('creates tasks with trimmed titles', async () => {
    const s = fakeStore();
    const t = await createTaskOp(s, 'p1', '  New thing  ');
    expect(t.title).toBe('New thing');
    expect(t.projectId).toBe('p1');
    await expect(createTaskOp(s, undefined, '   ')).rejects.toThrow('must not be empty');
  });

  it('sets status by id or unique title', async () => {
    const s = fakeStore();
    await expect(setTaskStatusOp(s, undefined, 't1', 'doing')).resolves.toMatchObject({ status: 'doing' });
    await expect(setTaskStatusOp(s, undefined, 'Ship it', 'todo')).resolves.toMatchObject({ status: 'todo' });
    await expect(setTaskStatusOp(s, undefined, 't1', 'bogus')).rejects.toThrow('Invalid task status');
    await expect(setTaskStatusOp(s, undefined, 'missing', 'done')).rejects.toThrow('Task not found');
  });

  it('refuses ambiguous titles and points at ids', async () => {
    const s = fakeStore({
      tasks: [
        { id: 'a', projectId: 'p1', title: 'Same', status: 'todo', createdAt: 1, updatedAt: 1 },
        { id: 'b', projectId: 'p1', title: 'same', status: 'todo', createdAt: 2, updatedAt: 2 },
      ],
    });
    await expect(setTaskStatusOp(s, undefined, 'same', 'done')).rejects.toThrow('Ambiguous');
  });

  it('records memory with a default kind', async () => {
    const s = fakeStore();
    const m = await recordMemoryOp(s, undefined, '', '  learned: x  ');
    expect(m).toMatchObject({ kind: 'note', content: 'learned: x' });
    await expect(recordMemoryOp(s, undefined, 'note', '  ')).rejects.toThrow('must not be empty');
  });

  it('shows pending impact by default, all on request', async () => {
    const s = fakeStore();
    expect((await impactOp(s, undefined, false)).map((q) => q.id)).toEqual(['q1']);
    expect((await impactOp(s, undefined, true)).map((q) => q.id)).toEqual(['q1', 'q2']);
  });
});

describe('formatters', () => {
  it('renders lists and empty states', () => {
    expect(formatTasks([])).toBe('No tasks.');
    expect(formatTasks([{ id: 't1', projectId: 'p1', title: 'X', status: 'doing', createdAt: 1, updatedAt: 1 }]))
      .toBe('[doing] X (t1)');
    expect(formatHits([])).toBe('No matches.');
    expect(formatHits([{ kind: 'doc', id: 'd', title: 'T', snippet: 'S' }])).toBe('(doc) T — S');
    expect(formatImpact([])).toBe('Impact queue is clear.');
  });
});
