import type { Agent, AgentRun, Decision, DesignComponent, Doc, EvidenceItem, ExternalRef, ImpactItem, Job, Link, MemoryEntry, Milestone, MonitorCheck, Project, PullRequest, QualityGate, Release, Requirement, RequirementVersion, Screen, SecurityFinding, Sprint, SyncState, Task, TaskComment, TestCase, TestRun } from './types';
import { MIGRATIONS } from './schema';
import { findImpacted } from './links';
import {
  DOCS_FTS_SQL,
  DOCS_LIKE_SQL,
  MEMORY_FTS_SQL,
  MEMORY_LIKE_SQL,
  TASKS_FTS_SQL,
  TASKS_LIKE_SQL,
  isSearchable,
  toHits,
  toLikePattern,
  toMatchQuery,
  type SearchHit,
} from './search';

// One Store interface, two backends: real SQLite inside Tauri and a
// localStorage fallback so `pnpm dev` works in a plain browser too.

export interface Store {
  listProjects(): Promise<Project[]>;
  createProject(input: { name: string; summary?: string }): Promise<Project>;
  listTasks(projectId: string): Promise<Task[]>;
  createTask(projectId: string, title: string): Promise<Task>;
  setTaskStatus(id: string, status: Task['status']): Promise<void>;
  applyReviewedTaskStatus(expected: Task, status: Task['status']): Promise<boolean>;
  listTaskComments(projectId: string, taskId: string): Promise<TaskComment[]>;
  addTaskComment(projectId: string, taskId: string, input: { author: string; body: string }): Promise<TaskComment>;
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
  listRequirements(projectId: string): Promise<Requirement[]>;
  createRequirement(projectId: string, input: { title: string; body?: string; acceptance?: string }): Promise<Requirement>;
  listRequirementVersions(requirementId: string): Promise<RequirementVersion[]>;
  addRequirementVersion(requirementId: string, input: { body: string; acceptance?: string }): Promise<RequirementVersion>;
  listEvidence(projectId: string): Promise<EvidenceItem[]>;
  addEvidence(projectId: string, input: { title: string; source?: string; detail?: string }): Promise<EvidenceItem>;
  listImpact(projectId: string): Promise<ImpactItem[]>;
  resolveImpact(id: string, status: 'accepted' | 'dismissed'): Promise<void>;
  listSprints(projectId: string): Promise<Sprint[]>;
  createSprint(projectId: string, input: { name: string }): Promise<Sprint>;
  setSprintStatus(id: string, status: Sprint['status']): Promise<void>;
  listMilestones(projectId: string): Promise<Milestone[]>;
  createMilestone(projectId: string, name: string): Promise<Milestone>;
  listPullRequests(projectId: string): Promise<PullRequest[]>;
  createPullRequest(projectId: string, input: { title: string; branch?: string }): Promise<PullRequest>;
  setPullRequestStatus(id: string, status: PullRequest['status']): Promise<void>;
  listReleases(projectId: string): Promise<Release[]>;
  createRelease(projectId: string, input: { name: string; notes?: string }): Promise<Release>;
  listExternalRefs(projectId: string): Promise<ExternalRef[]>;
  addExternalRef(projectId: string, input: { entityKind: ExternalRef['entityKind']; entityId: string; service: string; externalId: string }): Promise<ExternalRef>;
  getSyncState(key: string): Promise<SyncState | null>;
  setSyncState(projectId: string, key: string, cursor: string): Promise<void>;
  listScreens(projectId: string): Promise<Screen[]>;
  createScreen(projectId: string, input: { name: string; route?: string; notes?: string }): Promise<Screen>;
  listComponents(projectId: string): Promise<DesignComponent[]>;
  createComponent(projectId: string, input: { name: string; kind?: string; notes?: string }): Promise<DesignComponent>;
  listTestCases(projectId: string): Promise<TestCase[]>;
  createTestCase(projectId: string, title: string): Promise<TestCase>;
  listTestRuns(testCaseId: string): Promise<TestRun[]>;
  recordTestRun(testCaseId: string, input: { status: 'pass' | 'fail'; note?: string }): Promise<TestRun>;
  listQualityGates(projectId: string): Promise<QualityGate[]>;
  createQualityGate(projectId: string, name: string): Promise<QualityGate>;
  setQualityGateStatus(id: string, status: QualityGate['status']): Promise<void>;
  listSecurityFindings(projectId: string): Promise<SecurityFinding[]>;
  createSecurityFinding(projectId: string, input: { title: string; severity?: string }): Promise<SecurityFinding>;
  setSecurityFindingStatus(id: string, status: SecurityFinding['status']): Promise<void>;
  listMonitorChecks(projectId: string): Promise<MonitorCheck[]>;
  createMonitorCheck(projectId: string, name: string): Promise<MonitorCheck>;
  setMonitorCheckStatus(id: string, status: MonitorCheck['status'], detail?: string): Promise<void>;
  listAgents(projectId: string): Promise<Agent[]>;
  registerAgent(projectId: string, input: { name: string; role?: string; model?: string }): Promise<Agent>;
  setAgentStatus(id: string, status: Agent['status']): Promise<void>;
  listAgentRuns(projectId: string): Promise<AgentRun[]>;
  startAgentRun(projectId: string, input: { agentId: string; jobId?: string; summary?: string }): Promise<AgentRun>;
  finishAgentRun(id: string, input: { status: 'done' | 'failed'; summary: string }): Promise<void>;
  listJobs(projectId: string): Promise<Job[]>;
  enqueueJob(projectId: string, input: { type: string; payload?: string }): Promise<Job>;
  claimDueJob(projectId: string, nowMs: number): Promise<Job | null>;
  completeJob(id: string, status: 'done' | 'failed', result: string): Promise<void>;
  requeueJob(id: string, runAfter: number): Promise<void>;
  search(projectId: string, query: string): Promise<SearchHit[]>;
}

export interface SqlDb {
  execute(query: string, params?: unknown[]): Promise<unknown>;
  select<T>(query: string, params?: unknown[]): Promise<T>;
}

const now = (): number => Date.now();
const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

// Newest-first with deterministic ties: later insertions win when two rows
// share a millisecond, matching SQL `ORDER BY created_at DESC, rowid DESC`.
function newestFirst<T extends { createdAt: number }>(items: T[]): T[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => b.item.createdAt - a.item.createdAt || b.i - a.i)
    .map(({ item }) => item);
}

interface ProjectRow { id: string; name: string; summary: string; status: string; created_at: number; updated_at: number }
interface TaskRow { id: string; project_id: string; title: string; status: string; created_at: number; updated_at: number }
interface TaskCommentRow { id: string; project_id: string; task_id: string; author: string; body: string; created_at: number }
interface DocRow { id: string; project_id: string; title: string; body: string; created_at: number; updated_at: number }
interface DecisionRow { id: string; project_id: string; title: string; context: string; verdict: string; created_at: number }
interface MemoryRow { id: string; project_id: string; kind: string; content: string; created_at: number }
interface LinkRow { id: string; project_id: string; from_kind: Link['fromKind']; from_id: string; to_kind: Link['toKind']; to_id: string; relation: string; created_at: number }
interface RequirementRow { id: string; project_id: string; title: string; status: string; current_version: number; created_at: number; updated_at: number }
interface RequirementVersionRow { id: string; requirement_id: string; version: number; body: string; acceptance: string; created_at: number }
interface EvidenceRow { id: string; project_id: string; title: string; source: string; detail: string; created_at: number }
interface ImpactRow { id: string; project_id: string; trigger_kind: ImpactItem['triggerKind']; trigger_id: string; entity_kind: ImpactItem['entityKind']; entity_id: string; reason: string; status: string; created_at: number; resolved_at: number | null }
interface SprintRow { id: string; project_id: string; name: string; status: string; starts_at: number | null; ends_at: number | null; created_at: number; updated_at: number }
interface MilestoneRow { id: string; project_id: string; name: string; due_at: number | null; status: string; created_at: number; updated_at: number }
interface PullRequestRow { id: string; project_id: string; title: string; status: string; branch: string; created_at: number; updated_at: number }
interface ReleaseRow { id: string; project_id: string; name: string; notes: string; status: string; created_at: number }
interface ExternalRefRow { id: string; project_id: string; entity_kind: ExternalRef['entityKind']; entity_id: string; service: string; external_id: string; created_at: number }
interface SyncStateRow { key: string; project_id: string; cursor: string; updated_at: number }
interface ScreenRow { id: string; project_id: string; name: string; route: string; notes: string; created_at: number; updated_at: number }
interface ComponentRow { id: string; project_id: string; name: string; kind: string; notes: string; created_at: number; updated_at: number }
interface TestCaseRow { id: string; project_id: string; title: string; status: string; created_at: number; updated_at: number }
interface TestRunRow { id: string; test_case_id: string; status: string; note: string; created_at: number }
interface QualityGateRow { id: string; project_id: string; name: string; status: string; created_at: number; updated_at: number }
interface SecurityFindingRow { id: string; project_id: string; title: string; severity: string; status: string; created_at: number; updated_at: number }
interface MonitorCheckRow { id: string; project_id: string; name: string; status: string; detail: string; checked_at: number | null; created_at: number }
interface AgentRow { id: string; project_id: string; name: string; role: string; model: string; status: string; created_at: number; updated_at: number }
interface AgentRunRow { id: string; project_id: string; agent_id: string; job_id: string | null; status: string; summary: string; started_at: number; finished_at: number | null }
interface JobRow { id: string; project_id: string; type: string; payload: string; status: string; attempts: number; run_after: number; lease_until: number | null; result: string; created_at: number; updated_at: number }
interface SearchResultRow { id: string; title: string; snippet: string }

const toStatus = (s: string): Task['status'] =>
  s === 'doing' || s === 'done' ? s : 'todo';

function commentInput(input: { author: string; body: string }): { author: string; body: string } {
  const author = input.author.trim();
  const body = input.body.trim();
  if (!author) throw new Error('Author must not be empty.');
  if (!body) throw new Error('Comment must not be empty.');
  return { author, body };
}

export class TauriStore implements Store {
  private ftsAvailable = true;

  constructor(private db: SqlDb) {}

  async migrate(): Promise<void> {
    // Production SQLite posture on every connection: WAL durability,
    // patient writers, enforced foreign keys.
    await this.db.execute('PRAGMA journal_mode=WAL');
    await this.db.execute('PRAGMA busy_timeout=5000');
    await this.db.execute('PRAGMA foreign_keys=ON');
    for (const sql of MIGRATIONS) {
      try {
        await this.db.execute(sql);
      } catch (err) {
        // FTS is optional: without it search falls back to LIKE.
        if (!sql.includes('_fts')) throw err;
        this.ftsAvailable = false;
      }
    }
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
    await this.db.execute('UPDATE tasks SET status = ?, updated_at = MAX(updated_at + 1, ?) WHERE id = ?', [status, now(), id]);
  }

  async applyReviewedTaskStatus(expected: Task, status: Task['status']): Promise<boolean> {
    const rows = await this.db.select<Array<{ id: string }>>(
      'UPDATE tasks SET status = ?, updated_at = MAX(updated_at + 1, ?) WHERE project_id = ? AND id = ? AND status = ? AND updated_at = ? RETURNING id',
      [status, now(), expected.projectId, expected.id, expected.status, expected.updatedAt],
    );
    return rows.length === 1;
  }

  private async requireCommentTask(projectId: string, taskId: string): Promise<void> {
    const rows = await this.db.select<Array<{ id: string }>>(
      'SELECT id FROM tasks WHERE project_id = ? AND id = ?', [projectId, taskId]);
    if (rows.length === 0) throw new Error('Task not found in project.');
  }

  async listTaskComments(projectId: string, taskId: string): Promise<TaskComment[]> {
    await this.requireCommentTask(projectId, taskId);
    const rows = await this.db.select<TaskCommentRow[]>(
      'SELECT * FROM task_comments WHERE project_id = ? AND task_id = ? ORDER BY created_at ASC, rowid ASC',
      [projectId, taskId]);
    return rows.map((r) => ({ id: r.id, projectId: r.project_id, taskId: r.task_id,
      author: r.author, body: r.body, createdAt: r.created_at }));
  }

  async addTaskComment(projectId: string, taskId: string, input: { author: string; body: string }): Promise<TaskComment> {
    const content = commentInput(input);
    await this.requireCommentTask(projectId, taskId);
    const comment: TaskComment = { id: uid(), projectId, taskId, ...content, createdAt: now() };
    await this.db.execute(
      'INSERT INTO task_comments (id, project_id, task_id, author, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [comment.id, projectId, taskId, comment.author, comment.body, comment.createdAt]);
    return comment;
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
      'SELECT * FROM decisions WHERE project_id = ? ORDER BY created_at DESC, rowid DESC', [projectId]);
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
      'SELECT * FROM memory_entries WHERE project_id = ? ORDER BY created_at DESC, rowid DESC', [projectId]);
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

  private async note(projectId: string, kind: string, content: string): Promise<void> {
    await this.db.execute(
      'INSERT INTO memory_entries (id, project_id, kind, content, created_at) VALUES (?, ?, ?, ?, ?)',
      [uid(), projectId, kind, content, now()],
    );
  }

  async listRequirements(projectId: string): Promise<Requirement[]> {
    const rows = await this.db.select<RequirementRow[]>(
      'SELECT * FROM requirements WHERE project_id = ? ORDER BY created_at ASC', [projectId]);
    return rows.map((r) => ({
      id: r.id, projectId: r.project_id, title: r.title, status: r.status,
      currentVersion: r.current_version, createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  }

  async createRequirement(projectId: string, input: { title: string; body?: string; acceptance?: string }): Promise<Requirement> {
    const t = now();
    const req: Requirement = { id: uid(), projectId, title: input.title, status: 'draft', currentVersion: 1, createdAt: t, updatedAt: t };
    await this.db.execute(
      'INSERT INTO requirements (id, project_id, title, status, current_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.id, req.projectId, req.title, req.status, req.currentVersion, req.createdAt, req.updatedAt],
    );
    await this.db.execute(
      'INSERT INTO requirement_versions (id, requirement_id, version, body, acceptance, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [uid(), req.id, 1, input.body ?? '', input.acceptance ?? '', t],
    );
    await this.note(projectId, 'requirement', `Requirement created: ${req.title} (v1).`);
    return req;
  }

  async listRequirementVersions(requirementId: string): Promise<RequirementVersion[]> {
    const rows = await this.db.select<RequirementVersionRow[]>(
      'SELECT * FROM requirement_versions WHERE requirement_id = ? ORDER BY version ASC', [requirementId]);
    return rows.map((r) => ({
      id: r.id, requirementId: r.requirement_id, version: r.version,
      body: r.body, acceptance: r.acceptance, createdAt: r.created_at,
    }));
  }

  async addRequirementVersion(requirementId: string, input: { body: string; acceptance?: string }): Promise<RequirementVersion> {
    const reqs = await this.db.select<RequirementRow[]>('SELECT * FROM requirements WHERE id = ?', [requirementId]);
    const req = reqs[0];
    if (!req) throw new Error(`requirement not found: ${requirementId}`);
    const version = req.current_version + 1;
    const v: RequirementVersion = { id: uid(), requirementId, version, body: input.body, acceptance: input.acceptance ?? '', createdAt: now() };
    await this.db.execute(
      'INSERT INTO requirement_versions (id, requirement_id, version, body, acceptance, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [v.id, v.requirementId, v.version, v.body, v.acceptance, v.createdAt],
    );
    await this.db.execute('UPDATE requirements SET current_version = ?, updated_at = ? WHERE id = ?', [version, now(), requirementId]);
    const links = await this.listLinks(req.project_id);
    const impacted = findImpacted(links, { kind: 'requirement', id: requirementId });
    for (const target of impacted) {
      await this.db.execute(
        'INSERT INTO impact_queue (id, project_id, trigger_kind, trigger_id, entity_kind, entity_id, reason, status, created_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [uid(), req.project_id, 'requirement', requirementId, target.kind, target.id, `requirement "${req.title}" v${version}`, 'pending', now(), null],
      );
    }
    await this.note(req.project_id, 'requirement', `Requirement updated: ${req.title} (v${version}); ${impacted.length} linked ${impacted.length === 1 ? 'item' : 'items'} queued for review.`);
    return v;
  }

  async listEvidence(projectId: string): Promise<EvidenceItem[]> {
    const rows = await this.db.select<EvidenceRow[]>(
      'SELECT * FROM evidence_items WHERE project_id = ? ORDER BY created_at ASC', [projectId]);
    return rows.map((r) => ({
      id: r.id, projectId: r.project_id, title: r.title,
      source: r.source, detail: r.detail, createdAt: r.created_at,
    }));
  }

  async addEvidence(projectId: string, input: { title: string; source?: string; detail?: string }): Promise<EvidenceItem> {
    const e: EvidenceItem = { id: uid(), projectId, title: input.title, source: input.source ?? '', detail: input.detail ?? '', createdAt: now() };
    await this.db.execute(
      'INSERT INTO evidence_items (id, project_id, title, source, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [e.id, e.projectId, e.title, e.source, e.detail, e.createdAt],
    );
    return e;
  }

  async listImpact(projectId: string): Promise<ImpactItem[]> {
    const rows = await this.db.select<ImpactRow[]>(
      `SELECT * FROM impact_queue WHERE project_id = ?
       ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC, rowid DESC`, [projectId]);
    return rows.map((r) => ({
      id: r.id, projectId: r.project_id, triggerKind: r.trigger_kind, triggerId: r.trigger_id,
      entityKind: r.entity_kind, entityId: r.entity_id, reason: r.reason,
      status: r.status === 'accepted' || r.status === 'dismissed' ? r.status : 'pending',
      createdAt: r.created_at, resolvedAt: r.resolved_at,
    }));
  }

  async resolveImpact(id: string, status: 'accepted' | 'dismissed'): Promise<void> {
    await this.db.execute('UPDATE impact_queue SET status = ?, resolved_at = ? WHERE id = ?', [status, now(), id]);
  }

  async listSprints(projectId: string): Promise<Sprint[]> {
    const rows = await this.db.select<SprintRow[]>(
      'SELECT * FROM sprints WHERE project_id = ? ORDER BY created_at ASC', [projectId]);
    return rows.map((r) => ({
      id: r.id, projectId: r.project_id, name: r.name,
      status: r.status === 'active' || r.status === 'closed' ? r.status : 'planned',
      startsAt: r.starts_at, endsAt: r.ends_at, createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  }

  async createSprint(projectId: string, input: { name: string }): Promise<Sprint> {
    const t = now();
    const s: Sprint = { id: uid(), projectId, name: input.name, status: 'planned', startsAt: null, endsAt: null, createdAt: t, updatedAt: t };
    await this.db.execute(
      'INSERT INTO sprints (id, project_id, name, status, starts_at, ends_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [s.id, s.projectId, s.name, s.status, s.startsAt, s.endsAt, s.createdAt, s.updatedAt],
    );
    await this.note(projectId, 'delivery', `Sprint created: ${s.name}.`);
    return s;
  }

  async setSprintStatus(id: string, status: Sprint['status']): Promise<void> {
    await this.db.execute('UPDATE sprints SET status = ?, updated_at = ? WHERE id = ?', [status, now(), id]);
  }

  async listMilestones(projectId: string): Promise<Milestone[]> {
    const rows = await this.db.select<MilestoneRow[]>(
      'SELECT * FROM milestones WHERE project_id = ? ORDER BY created_at ASC', [projectId]);
    return rows.map((r) => ({
      id: r.id, projectId: r.project_id, name: r.name, dueAt: r.due_at,
      status: r.status, createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  }

  async createMilestone(projectId: string, name: string): Promise<Milestone> {
    const t = now();
    const m: Milestone = { id: uid(), projectId, name, dueAt: null, status: 'open', createdAt: t, updatedAt: t };
    await this.db.execute(
      'INSERT INTO milestones (id, project_id, name, due_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [m.id, m.projectId, m.name, m.dueAt, m.status, m.createdAt, m.updatedAt],
    );
    await this.note(projectId, 'delivery', `Milestone created: ${m.name}.`);
    return m;
  }

  async listPullRequests(projectId: string): Promise<PullRequest[]> {
    const rows = await this.db.select<PullRequestRow[]>(
      'SELECT * FROM pull_requests WHERE project_id = ? ORDER BY created_at DESC, rowid DESC', [projectId]);
    return rows.map((r) => ({
      id: r.id, projectId: r.project_id, title: r.title,
      status: r.status === 'merged' || r.status === 'closed' ? r.status : 'open',
      branch: r.branch, createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  }

  async createPullRequest(projectId: string, input: { title: string; branch?: string }): Promise<PullRequest> {
    const t = now();
    const p: PullRequest = { id: uid(), projectId, title: input.title, status: 'open', branch: input.branch ?? '', createdAt: t, updatedAt: t };
    await this.db.execute(
      'INSERT INTO pull_requests (id, project_id, title, status, branch, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [p.id, p.projectId, p.title, p.status, p.branch, p.createdAt, p.updatedAt],
    );
    await this.note(projectId, 'delivery', `Pull request opened: ${p.title}.`);
    return p;
  }

  async setPullRequestStatus(id: string, status: PullRequest['status']): Promise<void> {
    await this.db.execute('UPDATE pull_requests SET status = ?, updated_at = ? WHERE id = ?', [status, now(), id]);
  }

  async listReleases(projectId: string): Promise<Release[]> {
    const rows = await this.db.select<ReleaseRow[]>(
      'SELECT * FROM releases WHERE project_id = ? ORDER BY created_at DESC, rowid DESC', [projectId]);
    return rows.map((r) => ({
      id: r.id, projectId: r.project_id, name: r.name,
      notes: r.notes, status: r.status, createdAt: r.created_at,
    }));
  }

  async createRelease(projectId: string, input: { name: string; notes?: string }): Promise<Release> {
    const r: Release = { id: uid(), projectId, name: input.name, notes: input.notes ?? '', status: 'draft', createdAt: now() };
    await this.db.execute(
      'INSERT INTO releases (id, project_id, name, notes, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [r.id, r.projectId, r.name, r.notes, r.status, r.createdAt],
    );
    await this.note(projectId, 'delivery', `Release drafted: ${r.name}.`);
    return r;
  }

  async listExternalRefs(projectId: string): Promise<ExternalRef[]> {
    const rows = await this.db.select<ExternalRefRow[]>(
      'SELECT * FROM external_refs WHERE project_id = ? ORDER BY created_at ASC', [projectId]);
    return rows.map((r) => ({
      id: r.id, projectId: r.project_id, entityKind: r.entity_kind, entityId: r.entity_id,
      service: r.service, externalId: r.external_id, createdAt: r.created_at,
    }));
  }

  async addExternalRef(projectId: string, input: { entityKind: ExternalRef['entityKind']; entityId: string; service: string; externalId: string }): Promise<ExternalRef> {
    const r: ExternalRef = { id: uid(), projectId, ...input, createdAt: now() };
    await this.db.execute(
      'INSERT INTO external_refs (id, project_id, entity_kind, entity_id, service, external_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [r.id, r.projectId, r.entityKind, r.entityId, r.service, r.externalId, r.createdAt],
    );
    return r;
  }

  async getSyncState(key: string): Promise<SyncState | null> {
    const rows = await this.db.select<SyncStateRow[]>('SELECT * FROM sync_state WHERE key = ?', [key]);
    const r = rows[0];
    return r ? { key: r.key, projectId: r.project_id, cursor: r.cursor, updatedAt: r.updated_at } : null;
  }

  async setSyncState(projectId: string, key: string, cursor: string): Promise<void> {
    await this.db.execute(
      'INSERT INTO sync_state (key, project_id, cursor, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET cursor = excluded.cursor, updated_at = excluded.updated_at',
      [key, projectId, cursor, now()],
    );
  }

  async listScreens(projectId: string): Promise<Screen[]> {
    const rows = await this.db.select<ScreenRow[]>(
      'SELECT * FROM screens WHERE project_id = ? ORDER BY created_at ASC', [projectId]);
    return rows.map((r) => ({
      id: r.id, projectId: r.project_id, name: r.name, route: r.route,
      notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  }

  async createScreen(projectId: string, input: { name: string; route?: string; notes?: string }): Promise<Screen> {
    const t = now();
    const s: Screen = { id: uid(), projectId, name: input.name, route: input.route ?? '', notes: input.notes ?? '', createdAt: t, updatedAt: t };
    await this.db.execute(
      'INSERT INTO screens (id, project_id, name, route, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [s.id, s.projectId, s.name, s.route, s.notes, s.createdAt, s.updatedAt],
    );
    await this.note(projectId, 'design', `Screen added: ${s.name}.`);
    return s;
  }

  async listComponents(projectId: string): Promise<DesignComponent[]> {
    const rows = await this.db.select<ComponentRow[]>(
      'SELECT * FROM components WHERE project_id = ? ORDER BY created_at ASC', [projectId]);
    return rows.map((r) => ({
      id: r.id, projectId: r.project_id, name: r.name, kind: r.kind,
      notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  }

  async createComponent(projectId: string, input: { name: string; kind?: string; notes?: string }): Promise<DesignComponent> {
    const t = now();
    const c: DesignComponent = { id: uid(), projectId, name: input.name, kind: input.kind ?? 'ui', notes: input.notes ?? '', createdAt: t, updatedAt: t };
    await this.db.execute(
      'INSERT INTO components (id, project_id, name, kind, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [c.id, c.projectId, c.name, c.kind, c.notes, c.createdAt, c.updatedAt],
    );
    await this.note(projectId, 'design', `Component registered: ${c.name}.`);
    return c;
  }

  async listTestCases(projectId: string): Promise<TestCase[]> {
    const rows = await this.db.select<TestCaseRow[]>(
      'SELECT * FROM test_cases WHERE project_id = ? ORDER BY created_at ASC', [projectId]);
    return rows.map((r) => ({
      id: r.id, projectId: r.project_id, title: r.title,
      status: r.status === 'pass' || r.status === 'fail' ? r.status : 'not-run',
      createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  }

  async createTestCase(projectId: string, title: string): Promise<TestCase> {
    const t = now();
    const c: TestCase = { id: uid(), projectId, title, status: 'not-run', createdAt: t, updatedAt: t };
    await this.db.execute(
      'INSERT INTO test_cases (id, project_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [c.id, c.projectId, c.title, c.status, c.createdAt, c.updatedAt],
    );
    return c;
  }

  async listTestRuns(testCaseId: string): Promise<TestRun[]> {
    const rows = await this.db.select<TestRunRow[]>(
      'SELECT * FROM test_runs WHERE test_case_id = ? ORDER BY created_at DESC, rowid DESC', [testCaseId]);
    return rows.map((r) => ({
      id: r.id, testCaseId: r.test_case_id, status: r.status === 'fail' ? 'fail' : 'pass',
      note: r.note, createdAt: r.created_at,
    }));
  }

  async recordTestRun(testCaseId: string, input: { status: 'pass' | 'fail'; note?: string }): Promise<TestRun> {
    const cases = await this.db.select<TestCaseRow[]>('SELECT * FROM test_cases WHERE id = ?', [testCaseId]);
    const c = cases[0];
    if (!c) throw new Error(`test case not found: ${testCaseId}`);
    const run: TestRun = { id: uid(), testCaseId, status: input.status, note: input.note ?? '', createdAt: now() };
    await this.db.execute(
      'INSERT INTO test_runs (id, test_case_id, status, note, created_at) VALUES (?, ?, ?, ?, ?)',
      [run.id, run.testCaseId, run.status, run.note, run.createdAt],
    );
    await this.db.execute('UPDATE test_cases SET status = ?, updated_at = ? WHERE id = ?', [input.status, now(), testCaseId]);
    await this.note(c.project_id, 'quality', `Test ${input.status === 'pass' ? 'passed' : 'failed'}: ${c.title}.`);
    return run;
  }

  async listQualityGates(projectId: string): Promise<QualityGate[]> {
    const rows = await this.db.select<QualityGateRow[]>(
      'SELECT * FROM quality_gates WHERE project_id = ? ORDER BY created_at ASC', [projectId]);
    return rows.map((r) => ({
      id: r.id, projectId: r.project_id, name: r.name,
      status: r.status === 'pass' || r.status === 'fail' ? r.status : 'pending',
      createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  }

  async createQualityGate(projectId: string, name: string): Promise<QualityGate> {
    const t = now();
    const g: QualityGate = { id: uid(), projectId, name, status: 'pending', createdAt: t, updatedAt: t };
    await this.db.execute(
      'INSERT INTO quality_gates (id, project_id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [g.id, g.projectId, g.name, g.status, g.createdAt, g.updatedAt],
    );
    return g;
  }

  async setQualityGateStatus(id: string, status: QualityGate['status']): Promise<void> {
    await this.db.execute('UPDATE quality_gates SET status = ?, updated_at = ? WHERE id = ?', [status, now(), id]);
  }

  async listSecurityFindings(projectId: string): Promise<SecurityFinding[]> {
    const rows = await this.db.select<SecurityFindingRow[]>(
      'SELECT * FROM security_findings WHERE project_id = ? ORDER BY created_at DESC, rowid DESC', [projectId]);
    return rows.map((r) => ({
      id: r.id, projectId: r.project_id, title: r.title, severity: r.severity,
      status: r.status === 'fixed' || r.status === 'dismissed' ? r.status : 'open',
      createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  }

  async createSecurityFinding(projectId: string, input: { title: string; severity?: string }): Promise<SecurityFinding> {
    const t = now();
    const f: SecurityFinding = { id: uid(), projectId, title: input.title, severity: input.severity ?? 'medium', status: 'open', createdAt: t, updatedAt: t };
    await this.db.execute(
      'INSERT INTO security_findings (id, project_id, title, severity, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [f.id, f.projectId, f.title, f.severity, f.status, f.createdAt, f.updatedAt],
    );
    await this.note(projectId, 'quality', `Security finding opened: ${f.title} (${f.severity}).`);
    return f;
  }

  async setSecurityFindingStatus(id: string, status: SecurityFinding['status']): Promise<void> {
    await this.db.execute('UPDATE security_findings SET status = ?, updated_at = ? WHERE id = ?', [status, now(), id]);
  }

  async listMonitorChecks(projectId: string): Promise<MonitorCheck[]> {
    const rows = await this.db.select<MonitorCheckRow[]>(
      'SELECT * FROM monitor_checks WHERE project_id = ? ORDER BY created_at ASC', [projectId]);
    return rows.map((r) => ({
      id: r.id, projectId: r.project_id, name: r.name,
      status: r.status === 'passing' || r.status === 'failing' ? r.status : 'unknown',
      detail: r.detail, checkedAt: r.checked_at, createdAt: r.created_at,
    }));
  }

  async createMonitorCheck(projectId: string, name: string): Promise<MonitorCheck> {
    const c: MonitorCheck = { id: uid(), projectId, name, status: 'unknown', detail: '', checkedAt: null, createdAt: now() };
    await this.db.execute(
      'INSERT INTO monitor_checks (id, project_id, name, status, detail, checked_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [c.id, c.projectId, c.name, c.status, c.detail, c.checkedAt, c.createdAt],
    );
    return c;
  }

  async setMonitorCheckStatus(id: string, status: MonitorCheck['status'], detail?: string): Promise<void> {
    await this.db.execute('UPDATE monitor_checks SET status = ?, detail = ?, checked_at = ? WHERE id = ?', [status, detail ?? '', now(), id]);
  }

  async listAgents(projectId: string): Promise<Agent[]> {
    const rows = await this.db.select<AgentRow[]>(
      'SELECT * FROM agents WHERE project_id = ? ORDER BY created_at ASC', [projectId]);
    return rows.map((r) => ({
      id: r.id, projectId: r.project_id, name: r.name, role: r.role, model: r.model,
      status: r.status === 'paused' ? 'paused' : 'active',
      createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  }

  async registerAgent(projectId: string, input: { name: string; role?: string; model?: string }): Promise<Agent> {
    const t = now();
    const a: Agent = { id: uid(), projectId, name: input.name, role: input.role ?? '', model: input.model ?? '', status: 'active', createdAt: t, updatedAt: t };
    await this.db.execute(
      'INSERT INTO agents (id, project_id, name, role, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [a.id, a.projectId, a.name, a.role, a.model, a.status, a.createdAt, a.updatedAt],
    );
    return a;
  }

  async setAgentStatus(id: string, status: Agent['status']): Promise<void> {
    await this.db.execute('UPDATE agents SET status = ?, updated_at = ? WHERE id = ?', [status, now(), id]);
  }

  async listAgentRuns(projectId: string): Promise<AgentRun[]> {
    const rows = await this.db.select<AgentRunRow[]>(
      'SELECT * FROM agent_runs WHERE project_id = ? ORDER BY started_at DESC, rowid DESC', [projectId]);
    return rows.map((r) => ({
      id: r.id, projectId: r.project_id, agentId: r.agent_id, jobId: r.job_id,
      status: r.status === 'done' || r.status === 'failed' ? r.status : 'running',
      summary: r.summary, startedAt: r.started_at, finishedAt: r.finished_at,
    }));
  }

  async startAgentRun(projectId: string, input: { agentId: string; jobId?: string; summary?: string }): Promise<AgentRun> {
    const run: AgentRun = { id: uid(), projectId, agentId: input.agentId, jobId: input.jobId ?? null, status: 'running', summary: input.summary ?? '', startedAt: now(), finishedAt: null };
    await this.db.execute(
      'INSERT INTO agent_runs (id, project_id, agent_id, job_id, status, summary, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [run.id, run.projectId, run.agentId, run.jobId, run.status, run.summary, run.startedAt, run.finishedAt],
    );
    return run;
  }

  async finishAgentRun(id: string, input: { status: 'done' | 'failed'; summary: string }): Promise<void> {
    await this.db.execute('UPDATE agent_runs SET status = ?, summary = ?, finished_at = ? WHERE id = ?', [input.status, input.summary, now(), id]);
  }

  async listJobs(projectId: string): Promise<Job[]> {
    const rows = await this.db.select<JobRow[]>(
      'SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at DESC, rowid DESC', [projectId]);
    return rows.map(toJob);
  }

  async enqueueJob(projectId: string, input: { type: string; payload?: string }): Promise<Job> {
    const t = now();
    const job: Job = { id: uid(), projectId, type: input.type, payload: input.payload ?? '{}', status: 'queued', attempts: 0, runAfter: t, leaseUntil: null, result: '', createdAt: t, updatedAt: t };
    await this.db.execute(
      'INSERT INTO jobs (id, project_id, type, payload, status, attempts, run_after, lease_until, result, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [job.id, job.projectId, job.type, job.payload, job.status, job.attempts, job.runAfter, job.leaseUntil, job.result, job.createdAt, job.updatedAt],
    );
    return job;
  }

  async claimDueJob(projectId: string, nowMs: number): Promise<Job | null> {
    const rows = await this.db.select<JobRow[]>(
      `SELECT * FROM jobs WHERE project_id = ? AND status = 'queued' AND run_after <= ?
       ORDER BY run_after ASC, rowid ASC LIMIT 1`, [projectId, nowMs]);
    const row = rows[0];
    if (!row) return null;
    await this.db.execute(
      'UPDATE jobs SET status = ?, attempts = ?, lease_until = ?, updated_at = ? WHERE id = ? AND status = ?',
      ['running', row.attempts + 1, nowMs + 60_000, now(), row.id, 'queued'],
    );
    const check = await this.db.select<JobRow[]>('SELECT * FROM jobs WHERE id = ?', [row.id]);
    const claimed = check[0];
    if (!claimed || claimed.status !== 'running') return null;
    return toJob(claimed);
  }

  async completeJob(id: string, status: 'done' | 'failed', result: string): Promise<void> {
    await this.db.execute('UPDATE jobs SET status = ?, result = ?, lease_until = ?, updated_at = ? WHERE id = ?', [status, result, null, now(), id]);
  }

  async requeueJob(id: string, runAfter: number): Promise<void> {
    await this.db.execute('UPDATE jobs SET status = ?, run_after = ?, lease_until = ?, updated_at = ? WHERE id = ?', ['queued', runAfter, null, now(), id]);
  }

  async search(projectId: string, query: string): Promise<SearchHit[]> {
    if (!isSearchable(query)) return [];
    if (this.ftsAvailable) {
      try {
        const match = toMatchQuery(query);
        const [docs, mem, tasks] = await Promise.all([
          this.db.select<SearchResultRow[]>(DOCS_FTS_SQL, [match, projectId]),
          this.db.select<SearchResultRow[]>(MEMORY_FTS_SQL, [match, projectId]),
          this.db.select<SearchResultRow[]>(TASKS_FTS_SQL, [match, projectId]),
        ]);
        return [...toHits('doc', docs), ...toHits('memory', mem), ...toHits('task', tasks)];
      } catch {
        this.ftsAvailable = false;
      }
    }
    const pattern = toLikePattern(query);
    const [docs, mem, tasks] = await Promise.all([
      this.db.select<SearchResultRow[]>(DOCS_LIKE_SQL, [projectId, pattern, pattern]),
      this.db.select<SearchResultRow[]>(MEMORY_LIKE_SQL, [projectId, pattern, pattern]),
      this.db.select<SearchResultRow[]>(TASKS_LIKE_SQL, [projectId, pattern]),
    ]);
    return [...toHits('doc', docs), ...toHits('memory', mem), ...toHits('task', tasks)];
  }
}

function toJob(r: JobRow): Job {
  return {
    id: r.id, projectId: r.project_id, type: r.type, payload: r.payload,
    status: r.status === 'running' || r.status === 'done' || r.status === 'failed' ? r.status : 'queued',
    attempts: r.attempts, runAfter: r.run_after, leaseUntil: r.lease_until,
    result: r.result, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

interface Dump {
  projects: Project[];
  tasks: Task[];
  taskComments: TaskComment[];
  docs: Doc[];
  decisions: Decision[];
  memory: MemoryEntry[];
  links: Link[];
  requirements: Requirement[];
  requirementVersions: RequirementVersion[];
  evidence: EvidenceItem[];
  impact: ImpactItem[];
  sprints: Sprint[];
  milestones: Milestone[];
  pullRequests: PullRequest[];
  releases: Release[];
  externalRefs: ExternalRef[];
  syncState: SyncState[];
  screens: Screen[];
  components: DesignComponent[];
  testCases: TestCase[];
  testRuns: TestRun[];
  qualityGates: QualityGate[];
  securityFindings: SecurityFinding[];
  monitorChecks: MonitorCheck[];
  agents: Agent[];
  agentRuns: AgentRun[];
  jobs: Job[];
}

const FALLBACK_KEY = 'tivity-fallback-v1';

function loadDump(): Dump {
  const empty: Dump = { projects: [], tasks: [], taskComments: [], docs: [], decisions: [], memory: [], links: [], requirements: [], requirementVersions: [], evidence: [], impact: [], sprints: [], milestones: [], pullRequests: [], releases: [], externalRefs: [], syncState: [], screens: [], components: [], testCases: [], testRuns: [], qualityGates: [], securityFindings: [], monitorChecks: [], agents: [], agentRuns: [], jobs: [] };
  try {
    if (typeof localStorage === 'undefined') return empty;
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (!raw) return empty;
    return { ...empty, ...(JSON.parse(raw) as Partial<Dump>) };
  } catch {
    return empty;
  }
}

export class BrowserStore implements Store {
  private data: Dump = loadDump();

  private memoryOnly = false;

  private save(): void {
    try {
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(this.data));
      this.memoryOnly = false;
    } catch {
      this.memoryOnly = true;
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

  private async withTaskWrite<T>(write: () => T): Promise<T> {
    return globalThis.navigator?.locks
      ? navigator.locks.request(FALLBACK_KEY, write)
      : write();
  }

  async setTaskStatus(id: string, status: Task['status']): Promise<void> {
    await this.withTaskWrite(() => {
      // Read persisted changes from another tab before updating this task.
      const latest = loadDump();
      if (!this.memoryOnly && latest.tasks.some(task => task.id === id)) this.data = latest;
      const t = this.data.tasks.find(task => task.id === id);
      if (t) {
        t.status = status;
        t.updatedAt = Math.max(t.updatedAt + 1, now());
        this.save();
      }
    });
  }

  async applyReviewedTaskStatus(expected: Task, status: Task['status']): Promise<boolean> {
    return this.withTaskWrite(() => {
      const latest = loadDump();
      if (this.memoryOnly) throw new Error('Board storage is unavailable.');
      const task = latest.tasks.find(t => t.projectId === expected.projectId && t.id === expected.id);
      if (!task) return false;
      if (task.status !== expected.status || task.updatedAt !== expected.updatedAt) {
        this.data = latest;
        return false;
      }
      task.status = status;
      task.updatedAt = Math.max(task.updatedAt + 1, now());
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(latest));
      this.data = latest;
      return true;
    });
  }

  private requireCommentTask(projectId: string, taskId: string): void {
    if (!this.data.tasks.some((task) => task.projectId === projectId && task.id === taskId)) {
      throw new Error('Task not found in project.');
    }
  }

  async listTaskComments(projectId: string, taskId: string): Promise<TaskComment[]> {
    this.requireCommentTask(projectId, taskId);
    return this.data.taskComments.filter((comment) => comment.projectId === projectId && comment.taskId === taskId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async addTaskComment(projectId: string, taskId: string, input: { author: string; body: string }): Promise<TaskComment> {
    const content = commentInput(input);
    this.requireCommentTask(projectId, taskId);
    const comment: TaskComment = { id: uid(), projectId, taskId, ...content, createdAt: now() };
    this.data.taskComments.push(comment);
    this.save();
    return comment;
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
    return newestFirst(this.data.decisions.filter((d) => d.projectId === projectId));
  }

  async recordDecision(projectId: string, input: { title: string; context?: string; verdict: string }): Promise<Decision> {
    const d: Decision = { id: uid(), projectId, title: input.title, context: input.context ?? '', verdict: input.verdict, createdAt: now() };
    this.data.decisions.push(d);
    this.save();
    return d;
  }

  async listMemory(projectId: string): Promise<MemoryEntry[]> {
    return newestFirst(this.data.memory.filter((m) => m.projectId === projectId));
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

  private note(projectId: string, kind: string, content: string): void {
    this.data.memory.push({ id: uid(), projectId, kind, content, createdAt: now() });
  }

  async listRequirements(projectId: string): Promise<Requirement[]> {
    return this.data.requirements.filter((r) => r.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt);
  }

  async createRequirement(projectId: string, input: { title: string; body?: string; acceptance?: string }): Promise<Requirement> {
    const t = now();
    const req: Requirement = { id: uid(), projectId, title: input.title, status: 'draft', currentVersion: 1, createdAt: t, updatedAt: t };
    this.data.requirements.push(req);
    this.data.requirementVersions.push({ id: uid(), requirementId: req.id, version: 1, body: input.body ?? '', acceptance: input.acceptance ?? '', createdAt: t });
    this.note(projectId, 'requirement', `Requirement created: ${req.title} (v1).`);
    this.save();
    return req;
  }

  async listRequirementVersions(requirementId: string): Promise<RequirementVersion[]> {
    return this.data.requirementVersions.filter((v) => v.requirementId === requirementId).sort((a, b) => a.version - b.version);
  }

  async addRequirementVersion(requirementId: string, input: { body: string; acceptance?: string }): Promise<RequirementVersion> {
    const req = this.data.requirements.find((r) => r.id === requirementId);
    if (!req) throw new Error(`requirement not found: ${requirementId}`);
    const version = req.currentVersion + 1;
    const v: RequirementVersion = { id: uid(), requirementId, version, body: input.body, acceptance: input.acceptance ?? '', createdAt: now() };
    this.data.requirementVersions.push(v);
    req.currentVersion = version;
    req.updatedAt = now();
    const links = this.data.links.filter((l) => l.projectId === req.projectId);
    const impacted = findImpacted(links, { kind: 'requirement', id: requirementId });
    for (const target of impacted) {
      this.data.impact.push({
        id: uid(), projectId: req.projectId, triggerKind: 'requirement', triggerId: requirementId,
        entityKind: target.kind, entityId: target.id, reason: `requirement "${req.title}" v${version}`,
        status: 'pending', createdAt: now(), resolvedAt: null,
      });
    }
    this.note(req.projectId, 'requirement', `Requirement updated: ${req.title} (v${version}); ${impacted.length} linked ${impacted.length === 1 ? 'item' : 'items'} queued for review.`);
    this.save();
    return v;
  }

  async listEvidence(projectId: string): Promise<EvidenceItem[]> {
    return this.data.evidence.filter((e) => e.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt);
  }

  async addEvidence(projectId: string, input: { title: string; source?: string; detail?: string }): Promise<EvidenceItem> {
    const e: EvidenceItem = { id: uid(), projectId, title: input.title, source: input.source ?? '', detail: input.detail ?? '', createdAt: now() };
    this.data.evidence.push(e);
    this.save();
    return e;
  }

  async listImpact(projectId: string): Promise<ImpactItem[]> {
    return this.data.impact
      .filter((q) => q.projectId === projectId)
      .map((q, i) => ({ q, i }))
      .sort((a, b) => (a.q.status === 'pending' ? 0 : 1) - (b.q.status === 'pending' ? 0 : 1) || b.q.createdAt - a.q.createdAt || b.i - a.i)
      .map(({ q }) => q);
  }

  async resolveImpact(id: string, status: 'accepted' | 'dismissed'): Promise<void> {
    const q = this.data.impact.find((x) => x.id === id);
    if (q) {
      q.status = status;
      q.resolvedAt = now();
      this.save();
    }
  }

  async listSprints(projectId: string): Promise<Sprint[]> {
    return this.data.sprints.filter((s) => s.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt);
  }

  async createSprint(projectId: string, input: { name: string }): Promise<Sprint> {
    const t = now();
    const s: Sprint = { id: uid(), projectId, name: input.name, status: 'planned', startsAt: null, endsAt: null, createdAt: t, updatedAt: t };
    this.data.sprints.push(s);
    this.note(projectId, 'delivery', `Sprint created: ${s.name}.`);
    this.save();
    return s;
  }

  async setSprintStatus(id: string, status: Sprint['status']): Promise<void> {
    const s = this.data.sprints.find((x) => x.id === id);
    if (s) {
      s.status = status;
      s.updatedAt = now();
      this.save();
    }
  }

  async listMilestones(projectId: string): Promise<Milestone[]> {
    return this.data.milestones.filter((m) => m.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt);
  }

  async createMilestone(projectId: string, name: string): Promise<Milestone> {
    const t = now();
    const m: Milestone = { id: uid(), projectId, name, dueAt: null, status: 'open', createdAt: t, updatedAt: t };
    this.data.milestones.push(m);
    this.note(projectId, 'delivery', `Milestone created: ${m.name}.`);
    this.save();
    return m;
  }

  async listPullRequests(projectId: string): Promise<PullRequest[]> {
    return newestFirst(this.data.pullRequests.filter((p) => p.projectId === projectId));
  }

  async createPullRequest(projectId: string, input: { title: string; branch?: string }): Promise<PullRequest> {
    const t = now();
    const p: PullRequest = { id: uid(), projectId, title: input.title, status: 'open', branch: input.branch ?? '', createdAt: t, updatedAt: t };
    this.data.pullRequests.push(p);
    this.note(projectId, 'delivery', `Pull request opened: ${p.title}.`);
    this.save();
    return p;
  }

  async setPullRequestStatus(id: string, status: PullRequest['status']): Promise<void> {
    const p = this.data.pullRequests.find((x) => x.id === id);
    if (p) {
      p.status = status;
      p.updatedAt = now();
      this.save();
    }
  }

  async listReleases(projectId: string): Promise<Release[]> {
    return newestFirst(this.data.releases.filter((r) => r.projectId === projectId));
  }

  async createRelease(projectId: string, input: { name: string; notes?: string }): Promise<Release> {
    const r: Release = { id: uid(), projectId, name: input.name, notes: input.notes ?? '', status: 'draft', createdAt: now() };
    this.data.releases.push(r);
    this.note(projectId, 'delivery', `Release drafted: ${r.name}.`);
    this.save();
    return r;
  }

  async listExternalRefs(projectId: string): Promise<ExternalRef[]> {
    return this.data.externalRefs.filter((r) => r.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt);
  }

  async addExternalRef(projectId: string, input: { entityKind: ExternalRef['entityKind']; entityId: string; service: string; externalId: string }): Promise<ExternalRef> {
    const r: ExternalRef = { id: uid(), projectId, ...input, createdAt: now() };
    this.data.externalRefs.push(r);
    this.save();
    return r;
  }

  async getSyncState(key: string): Promise<SyncState | null> {
    return this.data.syncState.find((s) => s.key === key) ?? null;
  }

  async setSyncState(projectId: string, key: string, cursor: string): Promise<void> {
    const existing = this.data.syncState.find((s) => s.key === key);
    if (existing) {
      existing.cursor = cursor;
      existing.updatedAt = now();
    } else {
      this.data.syncState.push({ key, projectId, cursor, updatedAt: now() });
    }
    this.save();
  }

  async listScreens(projectId: string): Promise<Screen[]> {
    return this.data.screens.filter((s) => s.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt);
  }

  async createScreen(projectId: string, input: { name: string; route?: string; notes?: string }): Promise<Screen> {
    const t = now();
    const s: Screen = { id: uid(), projectId, name: input.name, route: input.route ?? '', notes: input.notes ?? '', createdAt: t, updatedAt: t };
    this.data.screens.push(s);
    this.note(projectId, 'design', `Screen added: ${s.name}.`);
    this.save();
    return s;
  }

  async listComponents(projectId: string): Promise<DesignComponent[]> {
    return this.data.components.filter((c) => c.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt);
  }

  async createComponent(projectId: string, input: { name: string; kind?: string; notes?: string }): Promise<DesignComponent> {
    const t = now();
    const c: DesignComponent = { id: uid(), projectId, name: input.name, kind: input.kind ?? 'ui', notes: input.notes ?? '', createdAt: t, updatedAt: t };
    this.data.components.push(c);
    this.note(projectId, 'design', `Component registered: ${c.name}.`);
    this.save();
    return c;
  }

  async listTestCases(projectId: string): Promise<TestCase[]> {
    return this.data.testCases.filter((c) => c.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt);
  }

  async createTestCase(projectId: string, title: string): Promise<TestCase> {
    const t = now();
    const c: TestCase = { id: uid(), projectId, title, status: 'not-run', createdAt: t, updatedAt: t };
    this.data.testCases.push(c);
    this.save();
    return c;
  }

  async listTestRuns(testCaseId: string): Promise<TestRun[]> {
    return newestFirst(this.data.testRuns.filter((r) => r.testCaseId === testCaseId));
  }

  async recordTestRun(testCaseId: string, input: { status: 'pass' | 'fail'; note?: string }): Promise<TestRun> {
    const c = this.data.testCases.find((x) => x.id === testCaseId);
    if (!c) throw new Error(`test case not found: ${testCaseId}`);
    const run: TestRun = { id: uid(), testCaseId, status: input.status, note: input.note ?? '', createdAt: now() };
    this.data.testRuns.push(run);
    c.status = input.status;
    c.updatedAt = now();
    this.note(c.projectId, 'quality', `Test ${input.status === 'pass' ? 'passed' : 'failed'}: ${c.title}.`);
    this.save();
    return run;
  }

  async listQualityGates(projectId: string): Promise<QualityGate[]> {
    return this.data.qualityGates.filter((g) => g.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt);
  }

  async createQualityGate(projectId: string, name: string): Promise<QualityGate> {
    const t = now();
    const g: QualityGate = { id: uid(), projectId, name, status: 'pending', createdAt: t, updatedAt: t };
    this.data.qualityGates.push(g);
    this.save();
    return g;
  }

  async setQualityGateStatus(id: string, status: QualityGate['status']): Promise<void> {
    const g = this.data.qualityGates.find((x) => x.id === id);
    if (g) {
      g.status = status;
      g.updatedAt = now();
      this.save();
    }
  }

  async listSecurityFindings(projectId: string): Promise<SecurityFinding[]> {
    return newestFirst(this.data.securityFindings.filter((f) => f.projectId === projectId));
  }

  async createSecurityFinding(projectId: string, input: { title: string; severity?: string }): Promise<SecurityFinding> {
    const t = now();
    const f: SecurityFinding = { id: uid(), projectId, title: input.title, severity: input.severity ?? 'medium', status: 'open', createdAt: t, updatedAt: t };
    this.data.securityFindings.push(f);
    this.note(projectId, 'quality', `Security finding opened: ${f.title} (${f.severity}).`);
    this.save();
    return f;
  }

  async setSecurityFindingStatus(id: string, status: SecurityFinding['status']): Promise<void> {
    const f = this.data.securityFindings.find((x) => x.id === id);
    if (f) {
      f.status = status;
      f.updatedAt = now();
      this.save();
    }
  }

  async listMonitorChecks(projectId: string): Promise<MonitorCheck[]> {
    return this.data.monitorChecks.filter((c) => c.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt);
  }

  async createMonitorCheck(projectId: string, name: string): Promise<MonitorCheck> {
    const c: MonitorCheck = { id: uid(), projectId, name, status: 'unknown', detail: '', checkedAt: null, createdAt: now() };
    this.data.monitorChecks.push(c);
    this.save();
    return c;
  }

  async setMonitorCheckStatus(id: string, status: MonitorCheck['status'], detail?: string): Promise<void> {
    const c = this.data.monitorChecks.find((x) => x.id === id);
    if (c) {
      c.status = status;
      c.detail = detail ?? '';
      c.checkedAt = now();
      this.save();
    }
  }

  async listAgents(projectId: string): Promise<Agent[]> {
    return this.data.agents.filter((a) => a.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt);
  }

  async registerAgent(projectId: string, input: { name: string; role?: string; model?: string }): Promise<Agent> {
    const t = now();
    const a: Agent = { id: uid(), projectId, name: input.name, role: input.role ?? '', model: input.model ?? '', status: 'active', createdAt: t, updatedAt: t };
    this.data.agents.push(a);
    this.save();
    return a;
  }

  async setAgentStatus(id: string, status: Agent['status']): Promise<void> {
    const a = this.data.agents.find((x) => x.id === id);
    if (a) {
      a.status = status;
      a.updatedAt = now();
      this.save();
    }
  }

  async listAgentRuns(projectId: string): Promise<AgentRun[]> {
    return this.data.agentRuns
      .filter((r) => r.projectId === projectId)
      .map((r, i) => ({ r, i }))
      .sort((a, b) => b.r.startedAt - a.r.startedAt || b.i - a.i)
      .map(({ r }) => r);
  }

  async startAgentRun(projectId: string, input: { agentId: string; jobId?: string; summary?: string }): Promise<AgentRun> {
    const run: AgentRun = { id: uid(), projectId, agentId: input.agentId, jobId: input.jobId ?? null, status: 'running', summary: input.summary ?? '', startedAt: now(), finishedAt: null };
    this.data.agentRuns.push(run);
    this.save();
    return run;
  }

  async finishAgentRun(id: string, input: { status: 'done' | 'failed'; summary: string }): Promise<void> {
    const run = this.data.agentRuns.find((x) => x.id === id);
    if (run) {
      run.status = input.status;
      run.summary = input.summary;
      run.finishedAt = now();
      this.save();
    }
  }

  async listJobs(projectId: string): Promise<Job[]> {
    return newestFirst(this.data.jobs.filter((j) => j.projectId === projectId));
  }

  async enqueueJob(projectId: string, input: { type: string; payload?: string }): Promise<Job> {
    const t = now();
    const job: Job = { id: uid(), projectId, type: input.type, payload: input.payload ?? '{}', status: 'queued', attempts: 0, runAfter: t, leaseUntil: null, result: '', createdAt: t, updatedAt: t };
    this.data.jobs.push(job);
    this.save();
    return job;
  }

  async claimDueJob(projectId: string, nowMs: number): Promise<Job | null> {
    const due = this.data.jobs
      .filter((j) => j.projectId === projectId && j.status === 'queued' && j.runAfter <= nowMs)
      .sort((a, b) => a.runAfter - b.runAfter || a.createdAt - b.createdAt);
    const job = due[0];
    if (!job) return null;
    job.status = 'running';
    job.attempts += 1;
    job.leaseUntil = nowMs + 60_000;
    job.updatedAt = now();
    this.save();
    return { ...job };
  }

  async completeJob(id: string, status: 'done' | 'failed', result: string): Promise<void> {
    const job = this.data.jobs.find((x) => x.id === id);
    if (job) {
      job.status = status;
      job.result = result;
      job.leaseUntil = null;
      job.updatedAt = now();
      this.save();
    }
  }

  async requeueJob(id: string, runAfter: number): Promise<void> {
    const job = this.data.jobs.find((x) => x.id === id);
    if (job) {
      job.status = 'queued';
      job.runAfter = runAfter;
      job.leaseUntil = null;
      job.updatedAt = now();
      this.save();
    }
  }

  async search(projectId: string, query: string): Promise<SearchHit[]> {
    if (!isSearchable(query)) return [];
    const needle = query.trim().toLowerCase();
    const window = (text: string): string => {
      const i = text.toLowerCase().indexOf(needle);
      if (i < 0) return text.slice(0, 120);
      const start = Math.max(0, i - 40);
      const end = Math.min(text.length, i + needle.length + 40);
      return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
    };
    const hits: SearchHit[] = [];
    for (const d of this.data.docs.filter((x) => x.projectId === projectId)) {
      if (d.title.toLowerCase().includes(needle) || d.body.toLowerCase().includes(needle)) {
        hits.push({ kind: 'doc', id: d.id, title: d.title, snippet: window(d.body || d.title) });
      }
    }
    for (const m of this.data.memory.filter((x) => x.projectId === projectId)) {
      if (m.kind.toLowerCase().includes(needle) || m.content.toLowerCase().includes(needle)) {
        hits.push({ kind: 'memory', id: m.id, title: `${m.kind}: ${m.content.slice(0, 60)}`, snippet: window(m.content) });
      }
    }
    for (const t of this.data.tasks.filter((x) => x.projectId === projectId)) {
      if (t.title.toLowerCase().includes(needle)) {
        hits.push({ kind: 'task', id: t.id, title: t.title, snippet: '' });
      }
    }
    return hits.slice(0, 60);
  }
}

export async function ensureSeeded(store: Store): Promise<void> {
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
  const req = await store.createRequirement(p.id, { title: 'Offline-first launch', body: 'The app must work fully offline with local SQLite.', acceptance: 'Airplane-mode: CRUD, links and impact check all work.' });
  const ev = await store.addEvidence(p.id, { title: 'Tauri vs Electron research', source: 'OpenReplay Dec 2025', detail: 'Tauri installer 2-10MB, idle 30-50MB; Electron 80-150MB, 150-300MB idle.' });
  await store.addLink(p.id, { fromKind: 'evidence', fromId: ev.id, toKind: 'requirement', toId: req.id, relation: 'justifies' });
  await store.addLink(p.id, { fromKind: 'requirement', fromId: req.id, toKind: 'task', toId: t.id, relation: 'drives' });
  const sprint = await store.createSprint(p.id, { name: 'Sprint 1' });
  await store.setSprintStatus(sprint.id, 'active');
  await store.addLink(p.id, { fromKind: 'task', fromId: t.id, toKind: 'sprint', toId: sprint.id, relation: 'partOf' });
  const screen = await store.createScreen(p.id, { name: 'Home', route: '/' });
  const comp = await store.createComponent(p.id, { name: 'Sidebar', kind: 'layout' });
  await store.addLink(p.id, { fromKind: 'screen', fromId: screen.id, toKind: 'component', toId: comp.id, relation: 'contains' });
  await store.registerAgent(p.id, { name: 'Housekeeper', role: 'local maintenance', model: 'local-handlers' });
  await store.appendMemory(p.id, 'note', 'Seeded the welcome project.');
  await store.addLink(p.id, { fromKind: 'decision', fromId: d.id, toKind: 'task', toId: t.id, relation: 'drives' });
  await store.addLink(p.id, { fromKind: 'task', fromId: t.id, toKind: 'doc', toId: doc.id, relation: 'documents' });
}

// App-side wiring (Tauri plugin load + backend selection) lives in
// apps/desktop/src/store-setup.ts so this package stays dependency-free.
