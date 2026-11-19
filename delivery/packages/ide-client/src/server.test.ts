import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BrowserStore, type Project, type Store, type Task } from '@tivity/core';
import { createTivityServer } from './server';

type FakeMethods = Pick<
  Store,
  'listProjects' | 'search' | 'listTasks' | 'createTask' | 'setTaskStatus' | 'appendMemory' | 'listImpact'
>;

function fakeStore(): Store {
  const projects: Project[] = [
    { id: 'p1', name: 'Alpha', summary: '', status: 'active', createdAt: 1, updatedAt: 1 },
  ];
  const tasks: Task[] = [
    { id: 't1', projectId: 'p1', title: 'Write docs', status: 'todo', createdAt: 1, updatedAt: 1 },
  ];
  const methods: FakeMethods = {
    listProjects: async () => projects,
    search: async (_projectId, query) => (query.includes('docs')
      ? [{ kind: 'task' as const, id: 't1', title: 'Write docs', snippet: '' }]
      : []),
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
    appendMemory: async (projectId, kind, content) => (
      { id: 'm1', projectId, kind, content, createdAt: 9 }
    ),
    listImpact: async () => [],
  };
  return methods as unknown as Store;
}

const clients: Client[] = [];

async function connectedClient(store: Store, defaultProject?: string): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createTivityServer(store, defaultProject).connect(serverTransport);
  const client = new Client({ name: 'tivity-test', version: '0.0.0' });
  clients.push(client);
  await client.connect(clientTransport);
  return client;
}

afterEach(async () => {
  while (clients.length > 0) await clients.pop()!.close();
});

function payloadText(result: unknown): string {
  const res = result as { content: Array<{ type: string; text?: string }> };
  return res.content.map((c) => c.text ?? '').join('\n');
}

function isError(result: unknown): boolean {
  return (result as { isError?: boolean }).isError === true;
}

describe('MCP server (in-memory transport)', () => {
  it('advertises the nine Tivity tools', async () => {
    const client = await connectedClient(fakeStore());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'tivity_add_task_comment',
      'tivity_create_task',
      'tivity_impact',
      'tivity_projects',
      'tivity_record_memory',
      'tivity_search',
      'tivity_set_task_status',
      'tivity_task_comments',
      'tivity_tasks',
    ]);
  });

  it('shares persistent task discussion with agents and rejects invalid scope', async () => {
    const store = new BrowserStore();
    const project = await store.createProject({ name: 'Discussion' });
    const other = await store.createProject({ name: 'Other' });
    const task = await store.createTask(project.id, 'Review release');
    await store.addTaskComment(project.id, task.id, { author: 'Alex', body: 'Please inspect the trace.' });
    const client = await connectedClient(store, project.id);
    const posted = await client.callTool({ name: 'tivity_add_task_comment',
      arguments: { taskId: task.id, author: 'Review agent', body: 'The trace looks healthy.' } });
    expect(isError(posted)).toBe(false);
    const listed = await client.callTool({ name: 'tivity_task_comments', arguments: { taskId: task.id } });
    expect(payloadText(listed)).toContain('Please inspect the trace.');
    expect(payloadText(listed)).toContain('The trace looks healthy.');
    const wrongProject = await client.callTool({ name: 'tivity_task_comments',
      arguments: { project: other.id, taskId: task.id } });
    expect(isError(wrongProject)).toBe(true);
    const blank = await client.callTool({ name: 'tivity_add_task_comment',
      arguments: { taskId: task.id, author: 'Agent', body: ' ' } });
    expect(isError(blank)).toBe(true);
    expect(await store.listTaskComments(project.id, task.id)).toHaveLength(2);
  });

  it('serves projects, search, and tasks end to end', async () => {
    const client = await connectedClient(fakeStore());
    const projects = await client.callTool({ name: 'tivity_projects', arguments: {} });
    expect(payloadText(projects)).toContain('Alpha');
    const hits = await client.callTool({ name: 'tivity_search', arguments: { query: 'docs' } });
    expect(payloadText(hits)).toContain('Write docs');
    const tasks = await client.callTool({ name: 'tivity_tasks', arguments: { status: 'todo' } });
    expect(payloadText(tasks)).toContain('t1');
  });

  it('writes through create, status, and memory tools', async () => {
    const store = fakeStore();
    const client = await connectedClient(store);
    const created = await client.callTool({ name: 'tivity_create_task', arguments: { title: 'New' } });
    expect(payloadText(created)).toContain('New');
    const moved = await client.callTool({
      name: 'tivity_set_task_status',
      arguments: { task: 't1', status: 'done' },
    });
    expect(isError(moved)).toBe(false);
    expect(payloadText(moved)).toContain('done');
    const mem = await client.callTool({
      name: 'tivity_record_memory',
      arguments: { kind: 'learning', content: 'x' },
    });
    expect(payloadText(mem)).toContain('learning');
    expect((await store.listTasks('p1')).length).toBe(2);
  });

  it('returns tool errors (not crashes) for bad input', async () => {
    const client = await connectedClient(fakeStore());
    const badProject = await client.callTool({
      name: 'tivity_tasks',
      arguments: { project: 'missing' },
    });
    expect(isError(badProject)).toBe(true);
    expect(payloadText(badProject)).toContain('Project not found');
    const badStatus = await client.callTool({
      name: 'tivity_set_task_status',
      arguments: { task: 't1', status: 'bogus' },
    });
    expect(isError(badStatus)).toBe(true);
  });

  it('honors the server default project', async () => {
    const client = await connectedClient(fakeStore(), 'Alpha');
    const tasks = await client.callTool({ name: 'tivity_tasks', arguments: {} });
    expect(isError(tasks)).toBe(false);
    expect(payloadText(tasks)).toContain('t1');
  });
});
