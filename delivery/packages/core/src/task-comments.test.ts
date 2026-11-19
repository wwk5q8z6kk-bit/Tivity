import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { BrowserStore, TauriStore, type SqlDb, type Store } from './store';

afterEach(() => vi.restoreAllMocks());

describe.each(['browser', 'sqlite'] as const)('task discussion (%s)', (backend) => {
  async function open() {
    if (backend === 'browser') {
      const values = new Map<string, string>();
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      });
      return { store: new BrowserStore() as Store, reopen: async () => new BrowserStore(), close: () => vi.unstubAllGlobals() };
    }
    const raw = new DatabaseSync(':memory:');
    const db: SqlDb = {
      async execute(sql, params = []) {
        raw.prepare(sql).run(...params as Array<string | number | null>);
      },
      async select<T>(sql: string, params: unknown[] = []): Promise<T> {
        return raw.prepare(sql).all(...params as Array<string | number | null>) as T;
      },
    };
    const store = new TauriStore(db);
    await store.migrate();
    return { store: store as Store, reopen: async () => { await store.migrate(); return new TauriStore(db); }, close: () => raw.close() };
  }

  it('applies only the reviewed project and task revision', async () => {
    const opened = await open();
    try {
      const { store } = opened;
      const project = await store.createProject({ name: 'Board' });
      const original = await store.createTask(project.id, 'Verify release');
      const snapshot = { ...original };
      expect(await store.applyReviewedTaskStatus({ ...snapshot, projectId: 'other' }, 'done')).toBe(false);
      const other = await opened.reopen();
      await other.setTaskStatus(snapshot.id, 'doing');
      await other.setTaskStatus(snapshot.id, 'todo');
      expect(await store.applyReviewedTaskStatus(snapshot, 'done')).toBe(false);
      const [latest] = await other.listTasks(project.id);
      expect(await store.applyReviewedTaskStatus({ ...latest }, 'done')).toBe(true);
      const reopened = await opened.reopen();
      expect(await reopened.listTasks(project.id)).toEqual([expect.objectContaining({ status: 'done' })]);
    } finally { opened.close(); }
  });

  it('keeps human and agent comments in order and persists them across reopening', async () => {
    const opened = await open();
    try {
      const { store } = opened;
      const project = await store.createProject({ name: 'Shared work' });
      const task = await store.createTask(project.id, 'Investigate launch');
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const first = await store.addTaskComment(project.id, task.id, { author: '  Alex ', body: ' Check the logs. ' });
      const second = await store.addTaskComment(project.id, task.id, { author: 'Build agent', body: 'The trace points to startup.' });
      expect(first).toMatchObject({ projectId: project.id, taskId: task.id, author: 'Alex', body: 'Check the logs.' });
      const reopened = await opened.reopen();
      expect(await reopened.listTaskComments(project.id, task.id)).toEqual([first, second]);
      const other = await store.createTask(project.id, 'Different task');
      expect(await store.listTaskComments(project.id, other.id)).toEqual([]);
    } finally { opened.close(); }
  });

  it('rejects missing tasks and access through another project', async () => {
    const opened = await open();
    try {
      const { store } = opened;
      const first = await store.createProject({ name: 'One' });
      const second = await store.createProject({ name: 'Two' });
      const task = await store.createTask(first.id, 'Private work');
      await store.addTaskComment(first.id, task.id, { author: 'Alex', body: 'Internal context' });
      for (const id of [task.id, 'missing']) {
        await expect(store.listTaskComments(second.id, id)).rejects.toThrow('Task not found in project');
        await expect(store.addTaskComment(second.id, id, { author: 'Agent', body: 'Hello' }))
          .rejects.toThrow('Task not found in project');
      }
      expect(await store.listTaskComments(first.id, task.id)).toHaveLength(1);
    } finally { opened.close(); }
  });

  it('rejects blank authors and bodies without saving a comment', async () => {
    const opened = await open();
    try {
      const { store } = opened;
      const project = await store.createProject({ name: 'One' });
      const task = await store.createTask(project.id, 'Work');
      await expect(store.addTaskComment(project.id, task.id, { author: ' ', body: 'Hello' })).rejects.toThrow('Author');
      await expect(store.addTaskComment(project.id, task.id, { author: 'Alex', body: '\n ' })).rejects.toThrow('Comment');
      expect(await store.listTaskComments(project.id, task.id)).toEqual([]);
    } finally { opened.close(); }
  });
});
