import type { Decision, Doc, Link, MemoryEntry, Project, Task } from './types';
import { MIGRATIONS } from './schema';

// One Store interface, two backends: real SQLite inside Tauri and a
// localStorage fallback so `pnpm dev` works in a plain browser too.

export interface Store {
  listProjects(): Promise<Project[]>;
  createProject(input: { name: string; summary?: string }): Promise<Project>;
  listTasks(projectId: string): Promise<Task[]>;
  createTask(projectId: string, title: string): Promise<Task>;
  setTaskStatus(id: string, status: Task['status']): Promise<void>;
  listDocs(projectId: string): Promise<Doc[]>;
  createDoc(projectId: string, title: string, body?: string): Promise<Doc>;
  listDecisions(projectId: string): Promise<Decision[]>;
  recordDecision(
    projectId: string,
    input: { title: string; context?: string; verdict: string },
  ): Promise<Decision>;
  listMemory(projectId: string): Promise<MemoryEntry[]>;
  appendMemory(projectId: string, kind: string, content: string): Promise<MemoryEntry>;
  listLinks(projectId: string): Promise<Link[]>;
  addLink(
    projectId: string,
    input: { fromKind: Link['fromKind']; fromId: string; toKind: Link['toKind']; toId: string; relation: string },
  ): Promise<Link>;
}

interface SqlDb {
  execute(query: string, params?: unknown[]): Promise<unknown>;
  select<T>(query: string, params?: unknown[]): Promise<T>;
}

const now = (): number => Date.now();
const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

interface ProjectRow { id: string; name: string; summary: string; status: string; created_at: number; updated_at: number }
interface TaskRow { id: string; project_id: string; title: string; status: string; created_at: number; updated_at: number }
interface DocRow { id: string; project_id: string; title: string; body: string; created_at: number; updated_at: number }
interface DecisionRow { id: string; project_id: string; title: string; context: string; verdict: string; created_at: number }
interface MemoryRow { id: string; project_id: string; kind: string; content: string; created_at: number }
interface LinkRow { id: string; project_id: string; from_kind: Link['fromKind']; from_id: string; to_kind: Link['toKind']; to_id: string; relation: string; created_at: number }

const toStatus = (s: string): Task['status'] =>
  s === 'doing' || s === 'done' ? s : 'todo';

class TauriStore implements Store {
  constructor(private db: SqlDb) {}

  async migrate(): Promise<void> {
    // Production SQLite posture on every connection: WAL durability,
    // patient writers, enforced foreign keys.
    await this.db.execute('PRAGMA journal_mode=WAL');
    await this.db.execute('PRAGMA busy_timeout=5000');
    await this.db.execute('PRAGMA foreign_keys=ON');
    for (const sql of MIGRATIONS) await this.db.execute(sql);
  }

  async listProjects(): Promise<Project[]> {
    const rows = await this.db.select<ProjectRow[]>('SELECT * FROM projects ORDER BY created_at ASC');
    return rows.map((r) => ({
      id: r.id, name: r.name, summary: r.summary, status: r.status,
      createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  }

  async createProject(input: { name: string; summary?: string }): Promise<Project> {
    const p: Project = { id: uid(), name: input.name, summary: input.summary ?? '', status: 'active', createdAt: now(), updatedAt: now() };
    await this.db.execute(
      'INSERT INTO projects (id, name, summary, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [p.id, p.name, p.summary, p.status, p.createdAt, p.updatedAt],
    );
    return p;
  }

  async listTasks(projectId: string): Promise<Task[]> {
    const rows = await this.db.select<TaskRow[]>(
      'SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at ASC', [projectId]);
    return rows.map((r) => ({
      id: r.id, projectId: r.project_id, title: r.title, status: toStatus(r.status),
      createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  }

  async createTask(projectId: string, title: string): Promise<Task> {
    const t: Task = { id: uid(), projectId, title, status: 'todo', createdAt: now(), updatedAt: now() };
    await this.db.execute(
      'INSERT INTO tasks (id, project_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [t.id, t.projectId, t.title, t.status, t.createdAt, t.updatedAt],
    );
    return t;
  }

  async setTaskStatus(id: string, status: Task['status']): Promise<void> {
    await this.db.execute('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?', [status, now(), id]);
  }

  async listDocs(projectId: string): Promise<Doc[]> {
    const rows = await this.db.select<DocRow[]>(
      'SELECT * FROM docs WHERE project_id = ? ORDER BY created_at ASC', [projectId]);
    return rows.map((r) => ({
      id: r.id, projectId: r.project_id, title: r.title, body: r.body,
      createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  }

  async createDoc(projectId: string, title: string, body?: string): Promise<Doc> {
    const d: Doc = { id: uid(), projectId, title, body: body ?? '', createdAt: now(), updatedAt: now() };
    await this.db.execute(
      'INSERT INTO docs (id, project_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [d.id, d.projectId, d.title, d.body, d.createdAt, d.updatedAt],
    );
    return d;
  }

  async listDecisions(projectId: string): Promise<Decision[]> {
    const rows = await this.db.select<DecisionRow[]>(
      'SELECT * FROM decisions WHERE project_id = ? ORDER BY created_at DESC', [projectId]);
    return rows.map((r) => ({
      id: r.id, projectId: r.project_id, title: r.title, context: r.context,
      verdict: r.verdict, createdAt: r.created_at,
    }));
  }

  async recordDecision(projectId: string, input: { title: string; context?: string; verdict: string }): Promise<Decision> {
    const d: Decision = { id: uid(), projectId, title: input.title, context: input.context ?? '', verdict: input.verdict, createdAt: now() };
    await this.db.execute(
      'INSERT INTO decisions (id, project_id, title, context, verdict, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [d.id, d.projectId, d.title, d.context, d.verdict, d.createdAt],
    );
    return d;
  }

  async listMemory(projectId: string): Promise<MemoryEntry[]> {
    const rows = await this.db.select<MemoryRow[]>(
      'SELECT * FROM memory_entries WHERE project_id = ? ORDER BY created_at DESC', [projectId]);
    return rows.map((r) => ({
      id: r.id, projectId: r.project_id, kind: r.kind, content: r.content, createdAt: r.created_at,
    }));
  }

  async appendMemory(projectId: string, kind: string, content: string): Promise<MemoryEntry> {
    const m: MemoryEntry = { id: uid(), projectId, kind, content, createdAt: now() };
    await this.db.execute(
      'INSERT INTO memory_entries (id, project_id, kind, content, created_at) VALUES (?, ?, ?, ?, ?)',
      [m.id, m.projectId, m.kind, m.content, m.createdAt],
    );
    return m;
  }

  async listLinks(projectId: string): Promise<Link[]> {
    const rows = await this.db.select<LinkRow[]>(
      'SELECT * FROM links WHERE project_id = ? ORDER BY created_at ASC', [projectId]);
    return rows.map((r) => ({
      id: r.id, projectId: r.project_id, fromKind: r.from_kind, fromId: r.from_id,
      toKind: r.to_kind, toId: r.to_id, relation: r.relation, createdAt: r.created_at,
    }));
  }

  async addLink(projectId: string, input: { fromKind: Link['fromKind']; fromId: string; toKind: Link['toKind']; toId: string; relation: string }): Promise<Link> {
    const l: Link = { id: uid(), projectId, ...input, createdAt: now() };
    await this.db.execute(
      'INSERT INTO links (id, project_id, from_kind, from_id, to_kind, to_id, relation, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [l.id, l.projectId, l.fromKind, l.fromId, l.toKind, l.toId, l.relation, l.createdAt],
    );
    return l;
  }
}

interface Dump {
  projects: Project[];
  tasks: Task[];
  docs: Doc[];
  decisions: Decision[];
  memory: MemoryEntry[];
  links: Link[];
}

const FALLBACK_KEY = 'tivity-fallback-v1';

function loadDump(): Dump {
  const empty: Dump = { projects: [], tasks: [], docs: [], decisions: [], memory: [], links: [] };
  try {
    if (typeof localStorage === 'undefined') return empty;
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (!raw) return empty;
    return { ...empty, ...(JSON.parse(raw) as Partial<Dump>) };
  } catch {
    return empty;
  }
}

class BrowserStore implements Store {
  private data: Dump = loadDump();

  private save(): void {
    try {
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(this.data));
    } catch {
      // Storage full or blocked: keep running in memory for this session.
    }
  }

  async listProjects(): Promise<Project[]> {
    return [...this.data.projects].sort((a, b) => a.createdAt - b.createdAt);
  }

  async createProject(input: { name: string; summary?: string }): Promise<Project> {
    const p: Project = { id: uid(), name: input.name, summary: input.summary ?? '', status: 'active', createdAt: now(), updatedAt: now() };
    this.data.projects.push(p);
    this.save();
    return p;
  }

  async listTasks(projectId: string): Promise<Task[]> {
    return this.data.tasks.filter((t) => t.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt);
  }

  async createTask(projectId: string, title: string): Promise<Task> {
    const t: Task = { id: uid(), projectId, title, status: 'todo', createdAt: now(), updatedAt: now() };
    this.data.tasks.push(t);
    this.save();
    return t;
  }

  async setTaskStatus(id: string, status: Task['status']): Promise<void> {
    const t = this.data.tasks.find((x) => x.id === id);
    if (t) {
      t.status = status;
      t.updatedAt = now();
      this.save();
    }
  }

  async listDocs(projectId: string): Promise<Doc[]> {
    return this.data.docs.filter((d) => d.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt);
  }

  async createDoc(projectId: string, title: string, body?: string): Promise<Doc> {
    const d: Doc = { id: uid(), projectId, title, body: body ?? '', createdAt: now(), updatedAt: now() };
    this.data.docs.push(d);
    this.save();
    return d;
  }

  async listDecisions(projectId: string): Promise<Decision[]> {
    return this.data.decisions.filter((d) => d.projectId === projectId).sort((a, b) => b.createdAt - a.createdAt);
  }

  async recordDecision(projectId: string, input: { title: string; context?: string; verdict: string }): Promise<Decision> {
    const d: Decision = { id: uid(), projectId, title: input.title, context: input.context ?? '', verdict: input.verdict, createdAt: now() };
    this.data.decisions.push(d);
    this.save();
    return d;
  }

  async listMemory(projectId: string): Promise<MemoryEntry[]> {
    return this.data.memory.filter((m) => m.projectId === projectId).sort((a, b) => b.createdAt - a.createdAt);
  }

  async appendMemory(projectId: string, kind: string, content: string): Promise<MemoryEntry> {
    const m: MemoryEntry = { id: uid(), projectId, kind, content, createdAt: now() };
    this.data.memory.push(m);
    this.save();
    return m;
  }

  async listLinks(projectId: string): Promise<Link[]> {
    return this.data.links.filter((l) => l.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt);
  }

  async addLink(projectId: string, input: { fromKind: Link['fromKind']; fromId: string; toKind: Link['toKind']; toId: string; relation: string }): Promise<Link> {
    const l: Link = { id: uid(), projectId, ...input, createdAt: now() };
    this.data.links.push(l);
    this.save();
    return l;
  }
}

async function ensureSeeded(store: Store): Promise<void> {
  const existing = await store.listProjects();
  if (existing.length > 0) return;
  const p = await store.createProject({ name: 'Welcome to Tivity', summary: 'A connected sample: decision → task → doc, all linked.' });
  const d = await store.recordDecision(p.id, {
    title: 'Start local-first',
    context: 'Offline SQLite keeps every project usable without a server.',
    verdict: 'Ship Tauri + SQLite shell first.',
  });
  const t = await store.createTask(p.id, 'Connect your first docs and tasks with links');
  const doc = await store.createDoc(p.id, 'Project notes', 'Everything here links together: change one thing, see what it touches.');
  await store.appendMemory(p.id, 'note', 'Seeded the welcome project.');
  await store.addLink(p.id, { fromKind: 'decision', fromId: d.id, toKind: 'task', toId: t.id, relation: 'drives' });
  await store.addLink(p.id, { fromKind: 'task', fromId: t.id, toKind: 'doc', toId: doc.id, relation: 'documents' });
}

export type Backend = 'tauri-sql' | 'browser';

export async function createStore(): Promise<{ store: Store; backend: Backend }> {
  try {
    const mod = await import('@tauri-apps/plugin-sql');
    const db = (await mod.default.load('sqlite:tivity.db')) as unknown as SqlDb;
    const store = new TauriStore(db);
    await store.migrate();
    await ensureSeeded(store);
    return { store, backend: 'tauri-sql' };
  } catch {
    const store = new BrowserStore();
    await ensureSeeded(store);
    return { store, backend: 'browser' };
  }
}
