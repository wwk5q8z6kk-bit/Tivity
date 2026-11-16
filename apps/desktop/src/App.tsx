import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { Agent, AgentRun, Decision, DesignComponent, Doc, EntityKind, EvidenceItem, ExternalRef, ImpactItem, Job, Link, MemoryEntry, Milestone, MonitorCheck, Project, PullRequest, QualityGate, Release, Requirement, RequirementVersion, Screen, SecurityFinding, Sprint, Task, TestCase, TestRun } from '@tivity/core';
import type { Store } from '@tivity/core';
import { createStore } from './store-setup';
import { desktopAgentTask } from './agent-task';
import { CONNECTORS, connectorConfig, destinationForSearchKind, findImpacted, paletteCommands, searchHitElementId, shortId, TIVITY_MCP_TOOLS, type Connector, type ConnectorStance, type EntityRef, type PaletteCommand, type SearchHit } from '@tivity/core';

type Tab = 'tasks' | 'library' | 'activity' | 'links' | 'requirements' | 'ship' | 'agents' | 'connectors';
type ShipKind = 'delivery' | 'design' | 'quality' | 'release' | 'sync';
type RecordPlace = 'library' | 'activity' | 'links' | 'connectors' | 'sync';

const PAGES: Array<{ id: Tab; label: string }> = [
  { id: 'requirements', label: 'Requirements' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'library', label: 'Library' },
  { id: 'activity', label: 'Activity' },
  { id: 'ship', label: 'Ship' },
  { id: 'agents', label: 'Agents' },
  { id: 'links', label: 'Links' },
  { id: 'connectors', label: 'Connectors' },
];

const ASK_PAGES: Array<{ tab: Tab; section: string; label: string; ship?: ShipKind }> = [
  { tab: 'requirements', section: 'Build', label: 'Requirements' },
  { tab: 'tasks', section: 'Build', label: 'Tasks' },
  { tab: 'ship', section: 'Build', label: 'Design', ship: 'design' },
  { tab: 'ship', section: 'Build', label: 'Build', ship: 'delivery' },
  { tab: 'ship', section: 'Build', label: 'Quality', ship: 'quality' },
  { tab: 'ship', section: 'Build', label: 'Release', ship: 'release' },
  { tab: 'agents', section: 'Build', label: 'Agents' },
  { tab: 'library', section: 'Record', label: 'Library' },
  { tab: 'activity', section: 'Record', label: 'Activity' },
  { tab: 'links', section: 'Record', label: 'Links' },
  { tab: 'connectors', section: 'Record', label: 'Connectors' },
  { tab: 'ship', section: 'Record', label: 'Sync', ship: 'sync' },
];

type PaletteRow =
  | { key: string; command: PaletteCommand }
  | { key: string; hit: SearchHit };

function otherEnd(link: Link, taskId: string): { kind: EntityKind; id: string } | null {
  if (link.fromKind === 'task' && link.fromId === taskId) return { kind: link.toKind, id: link.toId };
  if (link.toKind === 'task' && link.toId === taskId) return { kind: link.fromKind, id: link.fromId };
  return null;
}

// currentTarget is cleared once the handler awaits. The submit event's
// target stays the form, so reset has to go through that.
function resetForm(e: FormEvent<HTMLFormElement>): void {
  if (e.target instanceof HTMLFormElement) e.target.reset();
}

const NEXT_STATUS = { todo: 'doing', doing: 'done', done: 'todo' } as const;
const NEXT_SPRINT = { planned: 'active', active: 'closed', closed: 'planned' } as const;
const NEXT_PR = { open: 'merged', merged: 'closed', closed: 'open' } as const;
const NEXT_GATE = { pending: 'pass', pass: 'fail', fail: 'pending' } as const;
const NEXT_FINDING = { open: 'fixed', fixed: 'dismissed', dismissed: 'open' } as const;

function pageLead(id: Tab): string {
  switch (id) {
    case 'requirements':
      return 'What the product must do, kept as versions.';
    case 'tasks':
      return 'The work in progress.';
    case 'library':
      return 'Docs and the decisions behind them.';
    case 'activity':
      return 'Evidence, memory, and agent runs.';
    case 'ship':
      return 'Design, build, quality, and sync.';
    case 'agents':
      return 'Ask an agent about a task, or run housekeeping.';
    case 'links':
      return 'How records connect, and what a change touches.';
    case 'connectors':
      return 'How other tools reach this project.';
    default: {
      const unexpected: never = id;
      return unexpected;
    }
  }
}

function recordLabel(id: RecordPlace): string {
  switch (id) {
    case 'library':
      return 'Library';
    case 'activity':
      return 'Activity';
    case 'links':
      return 'Links';
    case 'connectors':
      return 'Connectors';
    case 'sync':
      return 'Sync';
    default: {
      const unexpected: never = id;
      return unexpected;
    }
  }
}

function workKicker(current: Tab, kind: ShipKind, pageLabel: string | undefined): string {
  if (current !== 'ship') return pageLabel ?? 'Work';
  switch (kind) {
    case 'design':
      return 'Design';
    case 'delivery':
      return 'Build';
    case 'quality':
      return 'Quality';
    case 'release':
      return 'Release';
    case 'sync':
      return 'Sync';
    default: {
      const unexpected: never = kind;
      return unexpected;
    }
  }
}

function stageLead(current: Tab, kind: ShipKind): string {
  if (current !== 'ship') return pageLead(current);
  switch (kind) {
    case 'design':
      return 'Screens and components for the product.';
    case 'delivery':
      return 'The sprint and the pull requests in it.';
    case 'quality':
      return 'Tests, gates, findings, and checks.';
    case 'release':
      return 'Milestones and the releases cut from them.';
    case 'sync':
      return 'Pull issues into linked tasks, or push tasks to issues. The token stays in this session.';
    default: {
      const unexpected: never = kind;
      return unexpected;
    }
  }
}

function isShipKind(value: string): value is ShipKind {
  switch (value) {
    case 'delivery':
    case 'design':
    case 'quality':
    case 'release':
    case 'sync':
      return true;
    default:
      return false;
  }
}

function Entry({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field stack">
      <span>{label}</span>
      {children}
    </label>
  );
}

function isTab(value: string): value is Tab {
  return PAGES.some((page) => page.id === value);
}

function stanceHeading(stance: ConnectorStance): string {
  switch (stance) {
    case 'built-in':
      return 'Already connected';
    case 'attach':
      return 'Attach beside the app';
    case 'hold':
      return 'Held until the license is stated';
    default: {
      const unexpected: never = stance;
      return unexpected;
    }
  }
}

function placeLabel(backend: string): string {
  if (backend === 'tauri-sql') return 'Kept on this machine';
  if (backend === 'browser') return 'Browser copy';
  return backend;
}

function findShortcut(): string {
  if (typeof navigator === 'undefined') return 'Ctrl K';
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Ctrl K';
}

function columnLabel(status: Task['status']): string {
  switch (status) {
    case 'todo':
      return 'To do';
    case 'doing':
      return 'Doing';
    case 'done':
      return 'Done';
    default: {
      const unexpected: never = status;
      return unexpected;
    }
  }
}

function taskVerb(status: Task['status']): string {
  switch (status) {
    case 'todo':
      return 'Start';
    case 'doing':
      return 'Finish';
    case 'done':
      return 'Reopen';
    default: {
      const unexpected: never = status;
      return unexpected;
    }
  }
}

function sprintVerb(status: Sprint['status']): string {
  switch (status) {
    case 'planned':
      return 'Start';
    case 'active':
      return 'Close';
    case 'closed':
      return 'Reopen';
    default: {
      const unexpected: never = status;
      return unexpected;
    }
  }
}

function prVerb(status: PullRequest['status']): string {
  switch (status) {
    case 'open':
      return 'Merge';
    case 'merged':
      return 'Close';
    case 'closed':
      return 'Reopen';
    default: {
      const unexpected: never = status;
      return unexpected;
    }
  }
}

function gateVerb(status: QualityGate['status']): string {
  switch (status) {
    case 'pending':
      return 'Pass';
    case 'pass':
      return 'Fail';
    case 'fail':
      return 'Reset';
    default: {
      const unexpected: never = status;
      return unexpected;
    }
  }
}

function findingVerb(status: SecurityFinding['status']): string {
  switch (status) {
    case 'open':
      return 'Mark fixed';
    case 'fixed':
      return 'Dismiss';
    case 'dismissed':
      return 'Reopen';
    default: {
      const unexpected: never = status;
      return unexpected;
    }
  }
}

function initialTheme(): 'dark' | 'light' {
  if (typeof localStorage === 'undefined') return 'dark';
  const saved = localStorage.getItem('tivity-theme');
  if (saved === 'light' || saved === 'dark') return saved;
  if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}

export default function App() {
  const [store, setStore] = useState<Store | null>(null);
  const [backend, setBackend] = useState('…');
  const [error, setError] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState('');
  const [tab, setTab] = useState<Tab>('tasks');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [revealedDocId, setRevealedDocId] = useState('');
  const [commandQuery, setCommandQuery] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [hitQuery, setHitQuery] = useState('');
  const [assistantLog, setAssistantLog] = useState<string[]>([]);
  const [taskView, setTaskView] = useState<'list' | 'board'>('list');
  const [libraryKind, setLibraryKind] = useState<'doc' | 'decision'>('doc');
  const [activityKind, setActivityKind] = useState<'evidence' | 'memory' | 'runs'>('evidence');
  const [shipKind, setShipKind] = useState<ShipKind>('delivery');
  const [fold, setFold] = useState<string | null>(null);
  const keepOpen = useRef(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(initialTheme);
  const [keysOpen, setKeysOpen] = useState(false);
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 800px)').matches);
  const [buildOpen, setBuildOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [copiedConfigId, setCopiedConfigId] = useState<string | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const savingTask = useRef<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [memory, setMemory] = useState<MemoryEntry[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [impact, setImpact] = useState<EntityRef[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [activeReqId, setActiveReqId] = useState('');
  const [versions, setVersions] = useState<RequirementVersion[]>([]);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [queue, setQueue] = useState<ImpactItem[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [refs, setRefs] = useState<ExternalRef[]>([]);
  const [screens, setScreens] = useState<Screen[]>([]);
  const [designComponents, setDesignComponents] = useState<DesignComponent[]>([]);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [activeCaseId, setActiveCaseId] = useState('');
  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [gates, setGates] = useState<QualityGate[]>([]);
  const [findings, setFindings] = useState<SecurityFinding[]>([]);
  const [checks, setChecks] = useState<MonitorCheck[]>([]);
  const [syncResult, setSyncResult] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [runResult, setRunResult] = useState('');
  const [running, setRunning] = useState(false);
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [focus, setFocus] = useState<{ kind: SearchHit['kind']; id: string } | null>(null);
  const finderRef = useRef<HTMLInputElement>(null);

  function report(e: unknown): void {
    setError(e instanceof Error ? e.message : String(e));
  }

  useEffect(() => {
    createStore()
      .then(({ store: s, backend: b }) => {
        setStore(s);
        setBackend(b);
        return s.listProjects();
      })
      .then((ps) => {
        setProjects(ps);
        if (ps.length > 0) setActiveId(ps[0].id);
      })
      .catch(report);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('tivity-theme', theme);
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 800px)');
    const apply = () => setNarrow(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!store || !activeId) return;
    store.listTasks(activeId).then(setTasks).catch(report);
    store.listDocs(activeId).then(setDocs).catch(report);
    store.listDecisions(activeId).then(setDecisions).catch(report);
    store.listMemory(activeId).then(setMemory).catch(report);
    store.listLinks(activeId).then(setLinks).catch(report);
    store.listRequirements(activeId).then((rs) => {
      setRequirements(rs);
      setActiveReqId((cur) => (cur && rs.some((r) => r.id === cur) ? cur : (rs[0]?.id ?? '')));
    }).catch(report);
    store.listEvidence(activeId).then(setEvidence).catch(report);
    store.listImpact(activeId).then(setQueue).catch(report);
    store.listSprints(activeId).then(setSprints).catch(report);
    store.listMilestones(activeId).then(setMilestones).catch(report);
    store.listPullRequests(activeId).then(setPrs).catch(report);
    store.listReleases(activeId).then(setReleases).catch(report);
    store.listExternalRefs(activeId).then(setRefs).catch(report);
    store.listScreens(activeId).then(setScreens).catch(report);
    store.listComponents(activeId).then(setDesignComponents).catch(report);
    store.listTestCases(activeId).then((cs) => {
      setTestCases(cs);
      setActiveCaseId((cur) => (cur && cs.some((c) => c.id === cur) ? cur : (cs[0]?.id ?? '')));
    }).catch(report);
    store.listQualityGates(activeId).then(setGates).catch(report);
    store.listSecurityFindings(activeId).then(setFindings).catch(report);
    store.listMonitorChecks(activeId).then(setChecks).catch(report);
    store.listAgents(activeId).then(setAgents).catch(report);
    store.listAgentRuns(activeId).then(setRuns).catch(report);
    store.listJobs(activeId).then(setJobs).catch(report);
    setImpact([]);
    setFocus(null);
    setSearchHits([]);
    setSelectedTaskId('');
    setRevealedDocId('');
    setCommandQuery('');
    setPaletteOpen(false);
    setAssistantLog([]);
  }, [store, activeId]);

  useEffect(() => {
    if (!focus) return;
    document.getElementById(searchHitElementId(focus))?.scrollIntoView({ block: 'nearest' });
  }, [focus, tab]);

  const paletteKey = useRef<(e: KeyboardEvent) => void>(() => {});

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      paletteKey.current(e);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (keepOpen.current) {
      keepOpen.current = false;
      return;
    }
    setFold(null);
  }, [tab, libraryKind, activityKind, shipKind]);

  useEffect(() => {
    if (!fold) return;
    const root = document.getElementById('work');
    const field = root?.querySelector<HTMLElement>('.add-fold[open] input, .add-fold[open] textarea');
    field?.focus();
  }, [fold, tab, shipKind]);

  useEffect(() => {
    if (!store || !activeId || !paletteOpen) return;
    const q = commandQuery.trim();
    if (!q) return;
    let cancel = false;
    store.search(activeId, q).then((hits) => {
      if (cancel) return;
      setSearchHits(hits);
      setHitQuery(q);
    }).catch(report);
    return () => { cancel = true; };
  }, [commandQuery, paletteOpen, store, activeId]);

  useEffect(() => {
    if (!store || !activeReqId) {
      setVersions([]);
      return;
    }
    store.listRequirementVersions(activeReqId).then(setVersions).catch(report);
  }, [store, activeReqId]);

  useEffect(() => {
    if (!store || !activeCaseId) {
      setTestRuns([]);
      return;
    }
    store.listTestRuns(activeCaseId).then(setTestRuns).catch(report);
  }, [store, activeCaseId]);

  async function reloadActive(): Promise<void> {
    if (!store || !activeId) return;
    try {
      const [t, d, dec, m, l, rs, ev, q, sp, ms, pr, rel, refs, scr, cmp, tc, gt, sf, mc, ag, rn, jb] = await Promise.all([
        store.listTasks(activeId),
        store.listDocs(activeId),
        store.listDecisions(activeId),
        store.listMemory(activeId),
        store.listLinks(activeId),
        store.listRequirements(activeId),
        store.listEvidence(activeId),
        store.listImpact(activeId),
        store.listSprints(activeId),
        store.listMilestones(activeId),
        store.listPullRequests(activeId),
        store.listReleases(activeId),
        store.listExternalRefs(activeId),
        store.listScreens(activeId),
        store.listComponents(activeId),
        store.listTestCases(activeId),
        store.listQualityGates(activeId),
        store.listSecurityFindings(activeId),
        store.listMonitorChecks(activeId),
        store.listAgents(activeId),
        store.listAgentRuns(activeId),
        store.listJobs(activeId),
      ]);
      setTasks(t);
      setDocs(d);
      setDecisions(dec);
      setMemory(m);
      setLinks(l);
      setRequirements(rs);
      setEvidence(ev);
      setQueue(q);
      setSprints(sp);
      setMilestones(ms);
      setPrs(pr);
      setReleases(rel);
      setRefs(refs);
      setScreens(scr);
      setDesignComponents(cmp);
      setTestCases(tc);
      setGates(gt);
      setFindings(sf);
      setChecks(mc);
      setAgents(ag);
      setRuns(rn);
      setJobs(jb);
      if (activeReqId) setVersions(await store.listRequirementVersions(activeReqId));
      if (activeCaseId) setTestRuns(await store.listTestRuns(activeCaseId));
    } catch (e) {
      report(e);
    }
  }

  function titleOf(kind: EntityKind, id: string): string {
    if (kind === 'task') return tasks.find((t) => t.id === id)?.title ?? shortId(id);
    if (kind === 'doc') return docs.find((d) => d.id === id)?.title ?? shortId(id);
    if (kind === 'decision') return decisions.find((d) => d.id === id)?.title ?? shortId(id);
    if (kind === 'memory') return memory.find((m) => m.id === id)?.content.slice(0, 40) ?? shortId(id);
    if (kind === 'requirement') return requirements.find((r) => r.id === id)?.title ?? shortId(id);
    if (kind === 'evidence') return evidence.find((e) => e.id === id)?.title ?? shortId(id);
    if (kind === 'sprint') return sprints.find((s) => s.id === id)?.name ?? shortId(id);
    if (kind === 'milestone') return milestones.find((x) => x.id === id)?.name ?? shortId(id);
    if (kind === 'pull_request') return prs.find((p) => p.id === id)?.title ?? shortId(id);
    if (kind === 'release') return releases.find((r) => r.id === id)?.name ?? shortId(id);
    if (kind === 'screen') return screens.find((s) => s.id === id)?.name ?? shortId(id);
    if (kind === 'component') return designComponents.find((c) => c.id === id)?.name ?? shortId(id);
    if (kind === 'test_case') return testCases.find((c) => c.id === id)?.title ?? shortId(id);
    if (kind === 'quality_gate') return gates.find((g) => g.id === id)?.name ?? shortId(id);
    if (kind === 'security_finding') return findings.find((f) => f.id === id)?.title ?? shortId(id);
    if (kind === 'monitor_check') return checks.find((c) => c.id === id)?.name ?? shortId(id);
    return `${kind}:${shortId(id)}`;
  }

  async function addProject(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!store) return;
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
    if (!name) return;
    try {
      const p = await store.createProject({ name });
      resetForm(e);
      setProjects(await store.listProjects());
      setActiveId(p.id);
    } catch (err) {
      report(err);
    }
  }

  async function addTask(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!store || !activeId) return;
    const title = String(new FormData(e.currentTarget).get('title') ?? '').trim();
    if (!title) return;
    try {
      await store.createTask(activeId, title);
      resetForm(e);
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  function remember(line: string): void {
    setAssistantLog((prev) => [line, ...prev].slice(0, 6));
  }

  async function setStatus(taskId: string, status: Task['status']): Promise<void> {
    if (!store || savingTask.current) return;
    savingTask.current = taskId;
    setSavingTaskId(taskId);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const shown = reduced ? Promise.resolve() : new Promise<void>((resolve) => { setTimeout(resolve, 160); });
    await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
    try {
      await store.setTaskStatus(taskId, status);
      await reloadActive();
      const title = tasks.find((t) => t.id === taskId)?.title ?? 'Task';
      remember(`Moved ${title} to ${columnLabel(status)}`);
    } catch (err) {
      report(err);
    } finally {
      await shown;
      savingTask.current = null;
      setSavingTaskId(null);
    }
  }

  async function cycleTask(t: Task): Promise<void> {
    await setStatus(t.id, NEXT_STATUS[t.status]);
  }

  async function addDoc(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!store || !activeId) return;
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get('title') ?? '').trim();
    if (!title) return;
    try {
      await store.createDoc(activeId, title, String(fd.get('body') ?? ''));
      resetForm(e);
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  async function addDecision(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!store || !activeId) return;
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get('title') ?? '').trim();
    const verdict = String(fd.get('verdict') ?? '').trim();
    if (!title || !verdict) return;
    try {
      await store.recordDecision(activeId, { title, context: String(fd.get('context') ?? ''), verdict });
      resetForm(e);
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  async function addMemory(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!store || !activeId) return;
    const fd = new FormData(e.currentTarget);
    const content = String(fd.get('content') ?? '').trim();
    if (!content) return;
    try {
      await store.appendMemory(activeId, String(fd.get('kind') ?? 'note') || 'note', content);
      resetForm(e);
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  async function addLink(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!store || !activeId) return;
    const fd = new FormData(e.currentTarget);
    const [fromKind, fromId] = String(fd.get('from') ?? '').split(':');
    const [toKind, toId] = String(fd.get('to') ?? '').split(':');
    const relation = String(fd.get('relation') ?? '').trim() || 'relates';
    if (!fromKind || !fromId || !toKind || !toId) return;
    try {
      await store.addLink(activeId, {
        fromKind: fromKind as EntityKind, fromId, toKind: toKind as EntityKind, toId, relation,
      });
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  function checkImpact(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const [kind, id] = String(new FormData(e.currentTarget).get('entity') ?? '').split(':');
    if (!kind || !id) return;
    setImpact(findImpacted(links, { kind: kind as EntityKind, id }));
  }

  async function addRequirement(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!store || !activeId) return;
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get('title') ?? '').trim();
    if (!title) return;
    try {
      const r = await store.createRequirement(activeId, { title, body: String(fd.get('body') ?? ''), acceptance: String(fd.get('acceptance') ?? '') });
      resetForm(e);
      await reloadActive();
      setActiveReqId(r.id);
    } catch (err) {
      report(err);
    }
  }

  async function addVersion(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!store || !activeReqId) return;
    const fd = new FormData(e.currentTarget);
    const body = String(fd.get('body') ?? '').trim();
    if (!body) return;
    try {
      await store.addRequirementVersion(activeReqId, { body, acceptance: String(fd.get('acceptance') ?? '') });
      resetForm(e);
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  async function addEvidence(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!store || !activeId) return;
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get('title') ?? '').trim();
    if (!title) return;
    try {
      await store.addEvidence(activeId, { title, source: String(fd.get('source') ?? ''), detail: String(fd.get('detail') ?? '') });
      resetForm(e);
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  async function resolveQueue(id: string, status: 'accepted' | 'dismissed'): Promise<void> {
    if (!store) return;
    try {
      await store.resolveImpact(id, status);
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  async function addSprint(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!store || !activeId) return;
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
    if (!name) return;
    try {
      await store.createSprint(activeId, { name });
      resetForm(e);
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  async function advanceSprint(s: Sprint): Promise<void> {
    if (!store) return;
    try {
      await store.setSprintStatus(s.id, NEXT_SPRINT[s.status]);
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  async function addMilestone(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!store || !activeId) return;
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
    if (!name) return;
    try {
      await store.createMilestone(activeId, name);
      resetForm(e);
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  async function addPR(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!store || !activeId) return;
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get('title') ?? '').trim();
    if (!title) return;
    try {
      await store.createPullRequest(activeId, { title, branch: String(fd.get('branch') ?? '') });
      resetForm(e);
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  async function advancePR(p: PullRequest): Promise<void> {
    if (!store) return;
    try {
      await store.setPullRequestStatus(p.id, NEXT_PR[p.status]);
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  async function addRelease(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!store || !activeId) return;
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') ?? '').trim();
    if (!name) return;
    try {
      await store.createRelease(activeId, { name, notes: String(fd.get('notes') ?? '') });
      resetForm(e);
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  async function addRef(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!store || !activeId) return;
    const fd = new FormData(e.currentTarget);
    const [kind, id] = String(fd.get('entity') ?? '').split(':');
    const service = String(fd.get('service') ?? '').trim() || 'github';
    const externalId = String(fd.get('externalId') ?? '').trim();
    if (!kind || !id || !externalId) return;
    try {
      await store.addExternalRef(activeId, { entityKind: kind as EntityKind, entityId: id, service, externalId });
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  async function addScreen(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!store || !activeId) return;
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') ?? '').trim();
    if (!name) return;
    try {
      await store.createScreen(activeId, { name, route: String(fd.get('route') ?? ''), notes: String(fd.get('notes') ?? '') });
      resetForm(e);
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  async function addComponent(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!store || !activeId) return;
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') ?? '').trim();
    if (!name) return;
    try {
      await store.createComponent(activeId, { name, kind: String(fd.get('kind') ?? '') || 'ui', notes: String(fd.get('notes') ?? '') });
      resetForm(e);
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  async function addTestCase(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!store || !activeId) return;
    const title = String(new FormData(e.currentTarget).get('title') ?? '').trim();
    if (!title) return;
    try {
      const c = await store.createTestCase(activeId, title);
      resetForm(e);
      await reloadActive();
      setActiveCaseId(c.id);
    } catch (err) {
      report(err);
    }
  }

  async function recordRun(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!store || !activeCaseId) return;
    const fd = new FormData(e.currentTarget);
    try {
      await store.recordTestRun(activeCaseId, {
        status: String(fd.get('status') ?? 'pass') === 'fail' ? 'fail' : 'pass',
        note: String(fd.get('note') ?? ''),
      });
      resetForm(e);
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  async function addGate(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!store || !activeId) return;
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
    if (!name) return;
    try {
      await store.createQualityGate(activeId, name);
      resetForm(e);
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  async function advanceGate(g: QualityGate): Promise<void> {
    if (!store) return;
    try {
      await store.setQualityGateStatus(g.id, NEXT_GATE[g.status]);
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  async function addFinding(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!store || !activeId) return;
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get('title') ?? '').trim();
    if (!title) return;
    try {
      await store.createSecurityFinding(activeId, { title, severity: String(fd.get('severity') ?? '') || 'medium' });
      resetForm(e);
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  async function advanceFinding(f: SecurityFinding): Promise<void> {
    if (!store) return;
    try {
      await store.setSecurityFindingStatus(f.id, NEXT_FINDING[f.status]);
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  async function addCheck(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!store || !activeId) return;
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
    if (!name) return;
    try {
      await store.createMonitorCheck(activeId, name);
      resetForm(e);
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  async function setCheck(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!store) return;
    const fd = new FormData(e.currentTarget);
    const id = String(fd.get('check') ?? '');
    const status = String(fd.get('status') ?? 'passing');
    if (!id) return;
    try {
      await store.setMonitorCheckStatus(id, (status === 'failing' ? 'failing' : 'passing'), String(fd.get('detail') ?? ''));
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  async function syncNow(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!store || !activeId || syncing) return;
    const fd = new FormData(e.currentTarget);
    const owner = String(fd.get('owner') ?? '').trim();
    const repo = String(fd.get('repo') ?? '').trim();
    const token = String(fd.get('token') ?? '').trim();
    const action = String(fd.get('action') ?? 'pull');
    if (!owner || !repo || !token) {
      setSyncResult('Owner, repo and token are all required.');
      return;
    }
    setSyncing(true);
    setSyncResult(action === 'push' ? 'Pushing…' : 'Pulling…');
    try {
      const { createOctokitClient, pullIssuesToTasks, pushTasksToIssues } = await import('@tivity/github-sync');
      const client = createOctokitClient(token);
      if (action === 'push') {
        const r = await pushTasksToIssues(store, client, activeId, owner, repo);
        setSyncResult(`Pushed to ${owner}/${repo}: ${r.created} created, ${r.updated} updated, ${r.skipped} unchanged, ${r.errors.length} errors.${r.errors.length > 0 ? ` First error: ${r.errors[0]}` : ''}`);
      } else {
        const r = await pullIssuesToTasks(store, client, activeId, owner, repo);
        setSyncResult(`Pulled ${owner}/${repo}: ${r.created} new tasks, ${r.skipped} already linked. (${r.cursor})`);
      }
      await reloadActive();
    } catch (err) {
      setSyncResult(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
    }
  }

  async function addAgent(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!store || !activeId) return;
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') ?? '').trim();
    if (!name) return;
    try {
      await store.registerAgent(activeId, { name, role: String(fd.get('role') ?? '') });
      resetForm(e);
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  async function toggleAgent(a: Agent): Promise<void> {
    if (!store) return;
    try {
      await store.setAgentStatus(a.id, a.status === 'active' ? 'paused' : 'active');
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  async function askAgent(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!store || !activeId || running) return;
    const fd = new FormData(e.currentTarget);
    const taskId = String(fd.get('task') ?? '');
    const goal = String(fd.get('goal') ?? '').trim();
    if (!taskId) {
      setRunResult('Pick a task first.');
      return;
    }
    setRunning(true);
    setRunResult('Agent thinking… (local model; a cold first run loads for minutes)');
    try {
      let agent = agents.find((a) => a.status === 'active');
      if (!agent) agent = await store.registerAgent(activeId, { name: 'Housekeeper', role: 'local maintenance', model: 'local-handlers' });
      await store.enqueueJob(activeId, { type: 'agent-task', payload: JSON.stringify({ taskId, goal }) });
      const { runDueJobs, localHandlers } = await import('@tivity/agent-runtime');
      const out = await runDueJobs(store, activeId, agent.id, { ...localHandlers, 'agent-task': desktopAgentTask });
      setRunResult(`Agent run finished: ${out.ran} ran, ${out.failed} failed. See Memory for the answer.`);
      await reloadActive();
    } catch (err) {
      setRunResult(`Agent run failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(false);
    }
  }

  async function runHousekeeping(): Promise<void> {
    if (!store || !activeId || running) return;
    setRunning(true);
    setRunResult('Running…');
    try {
      let agent = agents.find((a) => a.status === 'active');
      if (!agent) agent = await store.registerAgent(activeId, { name: 'Housekeeper', role: 'local maintenance', model: 'local-handlers' });
      await store.enqueueJob(activeId, { type: 'housekeeping' });
      await store.enqueueJob(activeId, { type: 'impact-nudge' });
      const { runDueJobs, localHandlers } = await import('@tivity/agent-runtime');
      const out = await runDueJobs(store, activeId, agent.id, { ...localHandlers, 'agent-task': desktopAgentTask });
      setRunResult(`Ran ${out.ran}, failed ${out.failed}.`);
      await reloadActive();
    } catch (err) {
      setRunResult(`Run failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(false);
    }
  }

  async function copyConnector(connector: Connector): Promise<void> {
    const text = connectorConfig(connector);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setError('');
      setCopiedConfigId(connector.id);
      return;
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      if (ok) {
        setError('');
        setCopiedConfigId(connector.id);
        return;
      }
      setError('Could not copy the config. Select it from the block.');
    }
  }

  function openSearchHit(hit: SearchHit): void {
    setFocus({ kind: hit.kind, id: hit.id });
    const destination = destinationForSearchKind(hit.kind);
    if (isTab(destination)) setTab(destination);
    if (hit.kind === 'doc') setLibraryKind('doc');
    if (hit.kind === 'memory') setActivityKind('memory');
    setPaletteOpen(false);
  }

  function isFocused(kind: SearchHit['kind'], id: string): boolean {
    return focus?.kind === kind && focus.id === id;
  }

  const active = projects.find((p) => p.id === activeId);
  const activeReq = requirements.find((r) => r.id === activeReqId);
  const activeCase = testCases.find((c) => c.id === activeCaseId);
  const entityOptions = (
    <>
      <optgroup label="Tasks">
        {tasks.map((t) => <option key={t.id} value={`task:${t.id}`}>{t.title}</option>)}
      </optgroup>
      <optgroup label="Docs">
        {docs.map((d) => <option key={d.id} value={`doc:${d.id}`}>{d.title}</option>)}
      </optgroup>
      <optgroup label="Decisions">
        {decisions.map((d) => <option key={d.id} value={`decision:${d.id}`}>{d.title}</option>)}
      </optgroup>
      <optgroup label="Requirements">
        {requirements.map((r) => <option key={r.id} value={`requirement:${r.id}`}>{r.title}</option>)}
      </optgroup>
      <optgroup label="Evidence">
        {evidence.map((e) => <option key={e.id} value={`evidence:${e.id}`}>{e.title}</option>)}
      </optgroup>
      <optgroup label="Sprints">
        {sprints.map((s) => <option key={s.id} value={`sprint:${s.id}`}>{s.name}</option>)}
      </optgroup>
      <optgroup label="Milestones">
        {milestones.map((x) => <option key={x.id} value={`milestone:${x.id}`}>{x.name}</option>)}
      </optgroup>
      <optgroup label="Pull requests">
        {prs.map((p) => <option key={p.id} value={`pull_request:${p.id}`}>{p.title}</option>)}
      </optgroup>
      <optgroup label="Releases">
        {releases.map((r) => <option key={r.id} value={`release:${r.id}`}>{r.name}</option>)}
      </optgroup>
      <optgroup label="Screens">
        {screens.map((s) => <option key={s.id} value={`screen:${s.id}`}>{s.name}</option>)}
      </optgroup>
      <optgroup label="Components">
        {designComponents.map((c) => <option key={c.id} value={`component:${c.id}`}>{c.name}</option>)}
      </optgroup>
      <optgroup label="Tests">
        {testCases.map((c) => <option key={c.id} value={`test_case:${c.id}`}>{c.title}</option>)}
      </optgroup>
      <optgroup label="Gates">
        {gates.map((g) => <option key={g.id} value={`quality_gate:${g.id}`}>{g.name}</option>)}
      </optgroup>
      <optgroup label="Findings">
        {findings.map((f) => <option key={f.id} value={`security_finding:${f.id}`}>{f.title}</option>)}
      </optgroup>
      <optgroup label="Checks">
        {checks.map((c) => <option key={c.id} value={`monitor_check:${c.id}`}>{c.name}</option>)}
      </optgroup>
    </>
  );

  const placeTab = PAGES.find((page) => page.id === tab);
  const pending = queue.filter((q) => q.status === 'pending').length;

  function tabCount(id: Tab): number {
    switch (id) {
      case 'requirements':
        return requirements.length;
      case 'tasks':
        return tasks.length;
      case 'library':
        return docs.length + decisions.length;
      case 'activity':
        return evidence.length + memory.length + runs.length;
      case 'ship':
        return sprints.length + prs.length + screens.length + designComponents.length + testCases.length + releases.length;
      case 'agents':
        return agents.length;
      case 'links':
        return pending > 0 ? pending : links.length;
      case 'connectors':
        return CONNECTORS.length;
      default: {
        const unexpected: never = id;
        return unexpected;
      }
    }
  }

  const showBoard = taskView === 'board' && tasks.length >= 2;

  function taskStatusButton(t: Task) {
    const saving = savingTaskId === t.id;
    return (
      <button type="button" className="ghost" aria-busy={saving} disabled={saving} onClick={() => { void cycleTask(t); }}>
        {saving ? 'Saving' : taskVerb(t.status)}
      </button>
    );
  }

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;
  const taskLinks = selectedTask
    ? links.flatMap((link) => {
      const other = otherEnd(link, selectedTask.id);
      return other ? [{ link, other }] : [];
    })
    : [];
  const linkedDocs = taskLinks.flatMap(({ other }) => {
    if (other.kind !== 'doc') return [];
    const doc = docs.find((d) => d.id === other.id);
    return doc ? [doc] : [];
  });
  const revealedDoc = docs.find((d) => d.id === revealedDocId) ?? null;
  const commands = paletteCommands({
    query: commandQuery,
    pages: ASK_PAGES,
    selected: selectedTask ? { title: selectedTask.title, status: selectedTask.status } : null,
    linkedDocs: linkedDocs.map((doc) => ({ id: doc.id, title: doc.title })),
  });
  const rows: PaletteRow[] = [
    ...commands.map((command) => ({ key: `${command.kind}:${command.label}`, command })),
    ...(paletteOpen && commandQuery.trim() === hitQuery
      ? searchHits.slice(0, 6).map((hit) => ({ key: `hit:${hit.kind}:${hit.id}`, hit }))
      : []),
  ];
  const clampedIndex = rows.length === 0 ? 0 : Math.min(paletteIndex, rows.length - 1);
  const activeRow = rows[clampedIndex] ?? null;

  function selectTask(id: string): void {
    setSelectedTaskId(id);
    setFocus({ kind: 'task', id });
    const docId = links.flatMap((link) => {
      const other = otherEnd(link, id);
      return other?.kind === 'doc' ? [other.id] : [];
    })[0] ?? '';
    setRevealedDocId(docId);
    setTab('tasks');
  }

  function askAboutSelected(): void {
    setCommandQuery('');
    setPaletteIndex(0);
    setPaletteOpen(true);
    finderRef.current?.focus();
  }

  async function runRow(row: PaletteRow): Promise<void> {
    if ('hit' in row) {
      const taskId = row.hit.kind === 'doc'
        ? links.flatMap((link) => {
          if (link.toKind === 'doc' && link.toId === row.hit.id && link.fromKind === 'task') return [link.fromId];
          if (link.fromKind === 'doc' && link.fromId === row.hit.id && link.toKind === 'task') return [link.toId];
          return [];
        })[0]
        : undefined;
      if (row.hit.kind === 'doc' && taskId) {
        selectTask(taskId);
        setRevealedDocId(row.hit.id);
      } else if (row.hit.kind === 'task') {
        selectTask(row.hit.id);
      } else {
        openSearchHit(row.hit);
      }
      setPaletteOpen(false);
      remember(`Opened ${row.hit.title}`);
      return;
    }
    switch (row.command.kind) {
      case 'go':
        if (row.command.ship && isShipKind(row.command.ship)) setShipKind(row.command.ship);
        if (isTab(row.command.tab)) setTab(row.command.tab);
        setCommandQuery('');
        setPaletteOpen(false);
        remember(`Opened ${row.command.label}`);
        return;
      case 'create-task': {
        if (!store || !activeId) return;
        const created = await store.createTask(activeId, row.command.title);
        setCommandQuery('');
        await reloadActive();
        selectTask(created.id);
        setPaletteOpen(false);
        remember(`Created ${row.command.title}`);
        return;
      }
      case 'status':
        if (!selectedTask) return;
        setPaletteOpen(false);
        await setStatus(selectedTask.id, row.command.status);
        return;
      case 'open-doc':
        if (selectedTask) selectTask(selectedTask.id);
        setRevealedDocId(row.command.docId);
        setPaletteOpen(false);
        remember(row.command.label);
        return;
      default: {
        const unexpected: never = row.command;
        return unexpected;
      }
    }
  }

  paletteKey.current = (e: KeyboardEvent): void => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      setPaletteOpen(true);
      finderRef.current?.focus();
      finderRef.current?.select();
      return;
    }
    if (e.key === 'Escape') {
      setPaletteOpen(false);
      setFold(null);
      setKeysOpen(false);
      return;
    }
    if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const tag = e.target instanceof HTMLElement ? e.target.tagName : '';
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (!typing) {
        e.preventDefault();
        setKeysOpen((open) => !open);
      }
    }
    if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const tag = e.target instanceof HTMLElement ? e.target.tagName : '';
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      const next = newFoldForPage();
      if (!typing && next) {
        e.preventDefault();
        setFold(next);
      }
    }
    if (!paletteOpen || document.activeElement !== finderRef.current || rows.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setPaletteIndex((index) => Math.min(rows.length - 1, index + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setPaletteIndex((index) => Math.max(0, index - 1));
      return;
    }
    if (e.key === 'Enter' && activeRow) {
      e.preventDefault();
      void runRow(activeRow);
    }
  };

  function onCommandSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (activeRow) {
      void runRow(activeRow);
      return;
    }
    const title = commandQuery.trim();
    if (!title) return;
    void runRow({
      key: 'create',
      command: { kind: 'create-task', title, label: `Create task "${title}"`, group: 'Create' },
    });
  }

  function openStep(step: { key: string; ready: boolean; tab: Tab; ship?: ShipKind }): void {
    const moving = step.tab !== tab || (step.ship != null && step.ship !== shipKind);
    if (moving) keepOpen.current = true;
    if (step.ship) setShipKind(step.ship);
    setTab(step.tab);
    if (step.ready) {
      setFold(null);
      return;
    }
    switch (step.key) {
      case 'requirements':
        setFold('requirement');
        return;
      case 'tasks': {
        const open = tasks.find((t) => t.status === 'doing') ?? tasks.find((t) => t.status === 'todo');
        if (open) {
          setFold(null);
          selectTask(open.id);
        } else {
          setFold('task');
        }
        return;
      }
      case 'design':
        setFold('screen');
        return;
      case 'build':
        setFold(sprints.length === 0 ? 'sprint' : 'pr');
        return;
      case 'quality':
        setFold('test');
        return;
      case 'release':
        setFold('release');
        return;
      case 'agents':
        setFold('agent');
        return;
      default:
        setFold(null);
    }
  }

  const todoCount = tasks.filter((t) => t.status === 'todo').length;
  const doingCount = tasks.filter((t) => t.status === 'doing').length;
  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const activeSprints = sprints.filter((s) => s.status === 'active').length;
  const openPrs = prs.filter((p) => p.status === 'open').length;
  const buildSteps: Array<{
    key: string;
    label: string;
    detail: string;
    ready: boolean;
    tab: Tab;
    ship?: ShipKind;
  }> = [
    {
      key: 'requirements',
      label: 'Requirements',
      detail: requirements.length === 0 ? 'None written' : `${requirements.length} written`,
      ready: requirements.length > 0,
      tab: 'requirements',
    },
    {
      key: 'tasks',
      label: 'Tasks',
      detail: tasks.length === 0 ? 'None yet' : `${doingCount} doing · ${todoCount} to do · ${doneCount} done`,
      ready: tasks.length > 0 && todoCount === 0 && doingCount === 0,
      tab: 'tasks',
    },
    {
      key: 'design',
      label: 'Design',
      detail: screens.length + designComponents.length === 0
        ? 'No screens'
        : `${screens.length} ${screens.length === 1 ? 'screen' : 'screens'} · ${designComponents.length} ${designComponents.length === 1 ? 'component' : 'components'}`,
      ready: screens.length > 0,
      tab: 'ship',
      ship: 'design',
    },
    {
      key: 'build',
      label: 'Build',
      detail: prs.length === 0
        ? (sprints.length === 0 ? 'No sprint' : `${activeSprints} active sprint · no pull request`)
        : `${openPrs} open pull requests`,
      ready: prs.length > 0,
      tab: 'ship',
      ship: 'delivery',
    },
    {
      key: 'quality',
      label: 'Quality',
      detail: testCases.length === 0 ? 'No tests' : `${testCases.length} tests · ${gates.length} gates`,
      ready: testCases.length > 0,
      tab: 'ship',
      ship: 'quality',
    },
    {
      key: 'release',
      label: 'Release',
      detail: releases.length === 0 ? 'None cut' : `${releases.length} recorded`,
      ready: releases.length > 0,
      tab: 'ship',
      ship: 'release',
    },
    {
      key: 'agents',
      label: 'Agents',
      detail: agents.length === 0 ? 'None registered' : `${agents.filter((a) => a.status === 'active').length} active`,
      ready: agents.length > 0,
      tab: 'agents',
    },
  ];
  const nextStep = buildSteps.find((step) => !step.ready) ?? null;
  const recorded = buildSteps.filter((step) => step.ready).length;

  function nextAction(step: { key: string }): string {
    switch (step.key) {
      case 'requirements':
        return 'Write a requirement';
      case 'tasks':
        return tasks.length === 0 ? 'Add a task' : 'Open the open task';
      case 'design':
        return 'Add a screen';
      case 'build':
        return sprints.length === 0 ? 'Add a sprint' : 'Add a pull request';
      case 'quality':
        return 'Add a test';
      case 'release':
        return 'Add a release';
      case 'agents':
        return 'Register an agent';
      default:
        return 'Open the next stage';
    }
  }

  function newFoldForPage(): string | null {
    switch (tab) {
      case 'requirements':
        return 'requirement';
      case 'tasks':
        return 'task';
      case 'library':
        return libraryKind === 'doc' ? 'doc' : 'decision';
      case 'activity':
        if (activityKind === 'evidence') return 'evidence';
        if (activityKind === 'memory') return 'memory';
        return null;
      case 'ship':
        switch (shipKind) {
          case 'delivery':
            return sprints.length === 0 ? 'sprint' : 'pr';
          case 'design':
            return 'screen';
          case 'quality':
            return 'test';
          case 'release':
            return 'release';
          case 'sync':
            return 'github';
          default: {
            const unexpected: never = shipKind;
            return unexpected;
          }
        }
      case 'agents':
        return 'agent';
      case 'links':
        return 'link';
      case 'connectors':
        return null;
      default: {
        const unexpected: never = tab;
        return unexpected;
      }
    }
  }

  function foldProps(id: string): { className: string; open: boolean; onToggle: (e: { currentTarget: HTMLDetailsElement }) => void } {
    return {
      className: 'add-fold',
      open: fold === id,
      onToggle: (e) => {
        const open = e.currentTarget.open;
        setFold((current) => (open ? id : current === id ? null : current));
      },
    };
  }

  function pageAction(): ReactNode {
    if (!nextStep) return null;
    const onStage = tab === nextStep.tab && (nextStep.ship == null || shipKind === nextStep.ship);
    if (!onStage) return null;
    return (
      <button type="button" className="go" onClick={() => openStep(nextStep)}>
        {nextAction(nextStep)}
      </button>
    );
  }

  return (
    <div className="app">
      <a className="skip" href="#work">Skip to work</a>
      <aside className="assistant" aria-label="Assistant">
        <div className="brand">
          <h1>Tivity<span>.</span></h1>
          <p className="place">{placeLabel(backend)}</p>
          <div className="brand-actions">
            <button type="button" className="ghost" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            <button type="button" className="ghost" aria-expanded={keysOpen} onClick={() => setKeysOpen((open) => !open)}>Keys</button>
          </div>
          {keysOpen ? (
            <div className="keys" role="dialog" aria-label="Shortcuts">
              <p><kbd>{findShortcut()}</kbd> Ask</p>
              <p><kbd>N</kbd> New</p>
              <p><kbd>?</kbd> Shortcuts</p>
              <p><kbd>Esc</kbd> Close</p>
            </div>
          ) : null}
        </div>
        <label className="field">
          <span>Project</span>
          <select value={activeId} onChange={(e) => setActiveId(e.target.value)}>
            {projects.length === 0 ? <option value="">No project</option> : null}
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <div className="finder-wrap">
          <form className="finder" onSubmit={onCommandSubmit}>
            <label className="finder-mark" htmlFor="finder">Ask</label>
            <input
              id="finder"
              ref={finderRef}
              type="text"
              value={commandQuery}
              placeholder="A page, a status, or a new task"
              aria-keyshortcuts="Meta+K Control+K"
              role="combobox"
              aria-expanded={paletteOpen}
              aria-controls="command-list"
              aria-autocomplete="list"
              aria-activedescendant={paletteOpen && activeRow ? `command-${clampedIndex}` : undefined}
              onChange={(e) => { setCommandQuery(e.target.value); setPaletteIndex(0); setPaletteOpen(true); }}
              onFocus={() => setPaletteOpen(true)}
            />
            <button className="go" type="submit">Run</button>
          </form>
          {paletteOpen ? (
            <ul className="finder-hits" id="command-list" role="listbox" aria-label="Commands">
              {rows.length === 0 ? <li className="muted">Nothing matches. Run creates a task from the phrase.</li> : rows.map((row, index) => (
                <li key={row.key} role="presentation">
                  <button
                    type="button"
                    role="option"
                    id={`command-${index}`}
                    className={index === clampedIndex ? 'hit active' : 'hit'}
                    aria-selected={index === clampedIndex}
                    onMouseEnter={() => setPaletteIndex(index)}
                    onClick={() => { void runRow(row); }}
                  >
                    <span className="pill">{'hit' in row ? row.hit.kind : row.command.group}</span>
                    {'hit' in row ? row.hit.title : row.command.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {nextStep ? <button type="button" className="go next-build" onClick={() => openStep(nextStep)}>{nextAction(nextStep)}</button> : <p className="ask-context">Every stage has a record.</p>}
        <details className="path-fold" open={!narrow || buildOpen} onToggle={(e) => { if (narrow) setBuildOpen(e.currentTarget.open); }}>
          <summary>Build</summary>
          <nav className="build-path" aria-label="Build">
          {buildSteps.map((step) => {
            const samePlace = tab === step.tab && (step.ship == null || shipKind === step.ship);
            const sharing = buildSteps.filter((other) => tab === other.tab && (other.ship == null || shipKind === other.ship));
            const here = samePlace && (sharing.find((other) => other.key === nextStep?.key)?.key ?? sharing[0]?.key) === step.key;
            return (
              <button
                key={step.key}
                type="button"
                className={here ? 'here' : undefined}
                aria-pressed={here}
                onClick={() => openStep(step)}
              >
                <span>{step.label}</span>
                {nextStep?.key === step.key ? <em>Next</em> : null}
                <small>{step.detail}</small>
              </button>
            );
          })}
          </nav>
        </details>
        <details className="path-fold" open={!narrow || recordOpen} onToggle={(e) => { if (narrow) setRecordOpen(e.currentTarget.open); }}>
          <summary>Record</summary>
          <nav className="build-path" aria-label="Record">
          {(['library', 'activity', 'links', 'connectors', 'sync'] as const).map((id) => {
            const current = id === 'sync' ? tab === 'ship' && shipKind === 'sync' : tab === id;
            const count = id === 'sync' ? refs.length : tabCount(id);
            return (
              <button
                key={id}
                type="button"
                className={current ? 'here' : undefined}
                aria-current={current ? 'page' : undefined}
                title={id === 'links' && pending > 0 ? 'Waiting for review' : undefined}
                onClick={() => {
                  if (id === 'sync') {
                    setShipKind('sync');
                    setTab('ship');
                    return;
                  }
                  setTab(id);
                }}
              >
                <span>{recordLabel(id)}</span>
                <small className="count">{count}</small>
              </button>
            );
          })}
          </nav>
        </details>
        {selectedTask ? (
          <div className="assistant-actions">
            <p className="ask-context">Working on {selectedTask.title}</p>
            <button type="button" className="ghost" aria-busy={savingTaskId === selectedTask.id} disabled={savingTaskId === selectedTask.id} onClick={() => { void cycleTask(selectedTask); }}>
              {savingTaskId === selectedTask.id ? 'Saving' : taskVerb(selectedTask.status)}
            </button>
            {linkedDocs[0] ? (
              <button type="button" className="ghost" onClick={() => { setRevealedDocId(linkedDocs[0].id); setTab('tasks'); remember(`Opened ${linkedDocs[0].title}`); }}>
                Open {linkedDocs[0].title}
              </button>
            ) : null}
          </div>
        ) : null}
        {assistantLog.length === 0 ? null : (
          <section className="assistant-log" aria-label="Recent actions">
            <h2>Recent</h2>
            <ul className="clean">
              {assistantLog.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}
            </ul>
          </section>
        )}
        <form className="new-project" onSubmit={addProject}>
          <input type="text" name="name" placeholder="New project" aria-label="New project" />
          <button className="go" type="submit">Add</button>
        </form>
      </aside>
      <main className="main">
        <header className="mast">
          <p className="kicker">{workKicker(tab, shipKind, placeTab?.label)}</p>
          <h2>{active ? active.name : 'No project selected'}</h2>
          <p className="progress">{active ? `${recorded} of ${buildSteps.length} stages recorded` : 'Choose a project to begin.'}</p>
        </header>
        {error ? <p className="error">{error}</p> : null}
        <div className="sheet" id="work" tabIndex={-1}>
        <div className="page-head">
          <p className="page-lead">{stageLead(tab, shipKind)}</p>
          {pageAction()}
        </div>

        {tab === 'requirements' && (
          <>
            <details {...foldProps('requirement')}>
              <summary>Add a requirement</summary>
              <form className="card" onSubmit={async (e) => {
                const title = String(new FormData(e.currentTarget).get('title') ?? '').trim();
                await addRequirement(e);
                if (title) setFold(null);
              }}>
                <Entry label="Title"><input type="text" name="title" placeholder="Requirement title" /></Entry>
                <Entry label="Body"><textarea name="body" rows={2} placeholder="Body" /></Entry>
                <Entry label="Acceptance"><input type="text" name="acceptance" placeholder="Acceptance criteria" /></Entry>
                <button className="go" type="submit">Add requirement</button>
              </form>
            </details>
            <div className="chooser" role="list">
              {requirements.map((r) => (
                <button key={r.id} type="button" className={r.id === activeReqId ? 'ghost selected' : 'ghost'} onClick={() => setActiveReqId(r.id)}>
                  {r.title} <span className="pill">v{r.currentVersion}</span>
                </button>
              ))}
            </div>
            {activeReq == null ? <p className="empty">{requirements.length === 0 ? 'No requirements yet.' : 'Select a requirement.'}</p> : (
              <>
                <h3>{activeReq.title} <span className="pill">{activeReq.status}</span></h3>
                {versions.map((v) => (
                  <div className="card" key={v.id}>
                    <h3>v{v.version}</h3>
                    <p>{v.body || <span className="muted">Empty.</span>}</p>
                    {v.acceptance ? <p><strong>Acceptance:</strong> {v.acceptance}</p> : null}
                  </div>
                ))}
                <details {...foldProps('version')}>
                  <summary>Save v{activeReq.currentVersion + 1}</summary>
                  <form className="card" onSubmit={addVersion}>
                    <Entry label="Body"><textarea name="body" rows={2} placeholder="What changed" /></Entry>
                    <Entry label="Acceptance"><input type="text" name="acceptance" placeholder="Acceptance criteria" /></Entry>
                    <button className="go" type="submit">Save v{activeReq.currentVersion + 1}</button>
                  </form>
                </details>
              </>
            )}
          </>
        )}

        {tab === 'ship' && shipKind === 'delivery' && (
          <>
            <h3>Sprints</h3>
            <ul className="clean">
              {sprints.map((s) => (
                <li key={s.id}>
                  <span className={`pill ${s.status === 'active' ? 'doing' : s.status === 'closed' ? 'done' : ''}`}>{s.status}</span>{' '}
                  {s.name}{' '}
                  <button className="ghost" onClick={() => advanceSprint(s)}>{sprintVerb(s.status)}</button>
                </li>
              ))}
            </ul>
            {sprints.length === 0 ? <p className="empty">No sprints yet.</p> : null}
            <details {...foldProps('sprint')}>
              <summary>Add a sprint</summary>
              <form className="row" onSubmit={addSprint}>
                <input type="text" name="name" placeholder="New sprint" aria-label="Sprint name" />
                <button className="go" type="submit">Add</button>
              </form>
            </details>
            <h3>Pull requests</h3>
            <ul className="clean">
              {prs.map((p) => (
                <li key={p.id}>
                  <span className={`pill ${p.status === 'merged' ? 'done' : p.status === 'open' ? 'doing' : ''}`}>{p.status}</span>{' '}
                  {p.title}{p.branch ? <span className="muted"> ({p.branch})</span> : null}{' '}
                  <button className="ghost" onClick={() => advancePR(p)}>{prVerb(p.status)}</button>
                </li>
              ))}
            </ul>
            {prs.length === 0 ? <p className="empty">No pull requests yet.</p> : null}
            <details {...foldProps('pr')}>
              <summary>Add a pull request</summary>
              <form className="row" onSubmit={addPR}>
                <Entry label="Title"><input type="text" name="title" placeholder="PR title" /></Entry>
                <Entry label="Branch"><input type="text" name="branch" placeholder="branch" /></Entry>
                <button className="go" type="submit">Add</button>
              </form>
            </details>
          </>
        )}

        {tab === 'ship' && shipKind === 'release' && (
          <>
            <h3>Milestones</h3>
            <ul className="clean">
              {milestones.map((x) => (
                <li key={x.id}><span className="pill">{x.status}</span> {x.name}</li>
              ))}
            </ul>
            {milestones.length === 0 ? <p className="empty">No milestones yet.</p> : null}
            <details {...foldProps('milestone')}>
              <summary>Add a milestone</summary>
              <form className="row" onSubmit={addMilestone}>
                <input type="text" name="name" placeholder="New milestone" aria-label="Milestone name" />
                <button className="go" type="submit">Add</button>
              </form>
            </details>
            <h3>Releases</h3>
            <ul className="clean">
              {releases.map((r) => (
                <li key={r.id}><span className="pill">{r.status}</span> {r.name}{r.notes ? <span className="muted"> — {r.notes}</span> : null}</li>
              ))}
            </ul>
            {releases.length === 0 ? <p className="empty">No releases yet.</p> : null}
            <details {...foldProps('release')}>
              <summary>Add a release</summary>
              <form className="row" onSubmit={addRelease}>
                <Entry label="Name"><input type="text" name="name" placeholder="Release name" /></Entry>
                <Entry label="Notes"><input type="text" name="notes" placeholder="notes" /></Entry>
                <button className="go" type="submit">Add</button>
              </form>
            </details>
          </>
        )}

        {tab === 'ship' && shipKind === 'design' && (
          <>
            <p className="muted">Screens and components connect on Links and show up in impact.</p>
            <h3>Screens</h3>
            <ul className="clean">
              {screens.map((s) => (
                <li key={s.id}>{s.name}{s.route ? <span className="muted"> ({s.route})</span> : null}{s.notes ? <span className="muted"> — {s.notes}</span> : null}</li>
              ))}
            </ul>
            {screens.length === 0 ? <p className="empty">No screens yet.</p> : null}
            <details {...foldProps('screen')}>
              <summary>Add a screen</summary>
              <form className="row" onSubmit={addScreen}>
                <Entry label="Name"><input type="text" name="name" placeholder="Screen name" /></Entry>
                <Entry label="Route"><input type="text" name="route" placeholder="route" /></Entry>
                <button className="go" type="submit">Add</button>
              </form>
            </details>
            <h3>Components</h3>
            <ul className="clean">
              {designComponents.map((c) => (
                <li key={c.id}><span className="pill">{c.kind}</span> {c.name}{c.notes ? <span className="muted"> — {c.notes}</span> : null}</li>
              ))}
            </ul>
            {designComponents.length === 0 ? <p className="empty">No components yet.</p> : null}
            <details {...foldProps('component')}>
              <summary>Add a component</summary>
              <form className="row" onSubmit={addComponent}>
                <Entry label="Name"><input type="text" name="name" placeholder="Component name" /></Entry>
                <Entry label="Kind"><input type="text" name="kind" placeholder="ui" /></Entry>
                <button className="go" type="submit">Add</button>
              </form>
            </details>
          </>
        )}

        {tab === 'ship' && shipKind === 'quality' && (
          <>
            <p className="muted">A person records these statuses until a CI feed is connected.</p>
            <h3>Tests</h3>
            <div className="chooser" role="list">
              {testCases.map((c) => (
                <button key={c.id} type="button" className={c.id === activeCaseId ? 'ghost selected' : 'ghost'} onClick={() => setActiveCaseId(c.id)}>
                  {c.title} <span className="pill">{c.status}</span>
                </button>
              ))}
            </div>
            {testCases.length === 0 ? <p className="empty">No tests yet.</p> : activeCase == null ? <p className="empty">Select a test.</p> : (
              <>
                <ul className="clean">
                  {testRuns.map((r) => (
                    <li key={r.id}><span className={`pill ${r.status === 'pass' ? 'done' : ''}`}>{r.status}</span> {r.note || <span className="muted">no note</span>}</li>
                  ))}
                </ul>
                {testRuns.length === 0 ? <p className="empty">No runs yet.</p> : null}
                <details {...foldProps('run')}>
                  <summary>Record a run</summary>
                  <form className="row" onSubmit={recordRun}>
                    <Entry label="Result">
                      <select name="status" defaultValue="pass">
                        <option value="pass">pass</option>
                        <option value="fail">fail</option>
                      </select>
                    </Entry>
                    <Entry label="Note"><input type="text" name="note" placeholder="run note" /></Entry>
                    <button className="go" type="submit">Record run</button>
                  </form>
                </details>
              </>
            )}
            <details {...foldProps('test')}>
              <summary>Add a test</summary>
              <form className="row" onSubmit={addTestCase}>
                <input type="text" name="title" placeholder="New test case" aria-label="Test name" />
                <button className="go" type="submit">Add</button>
              </form>
            </details>
            <h3>Quality gates</h3>
            <ul className="clean">
              {gates.map((g) => (
                <li key={g.id}>
                  <span className={`pill ${g.status === 'pass' ? 'done' : g.status === 'pending' ? 'doing' : ''}`}>{g.status}</span>{' '}
                  {g.name}{' '}
                  <button className="ghost" onClick={() => advanceGate(g)}>{gateVerb(g.status)}</button>
                </li>
              ))}
            </ul>
            {gates.length === 0 ? <p className="empty">No gates yet.</p> : null}
            <details {...foldProps('gate')}>
              <summary>Add a gate</summary>
              <form className="row" onSubmit={addGate}>
                <input type="text" name="name" placeholder="New gate" aria-label="Gate name" />
                <button className="go" type="submit">Add</button>
              </form>
            </details>
            <h3>Security findings</h3>
            <ul className="clean">
              {findings.map((f) => (
                <li key={f.id}>
                  <span className="pill">{f.severity}</span> <span className="pill">{f.status}</span>{' '}
                  {f.title}{' '}
                  <button className="ghost" onClick={() => advanceFinding(f)}>{findingVerb(f.status)}</button>
                </li>
              ))}
            </ul>
            {findings.length === 0 ? <p className="empty">No findings yet.</p> : null}
            <details {...foldProps('finding')}>
              <summary>Add a finding</summary>
              <form className="row" onSubmit={addFinding}>
                <Entry label="Title"><input type="text" name="title" placeholder="Finding title" /></Entry>
                <Entry label="Severity"><input type="text" name="severity" placeholder="severity" /></Entry>
                <button className="go" type="submit">Add</button>
              </form>
            </details>
            <h3>Monitor checks</h3>
            <ul className="clean">
              {checks.map((c) => (
                <li key={c.id}><span className={`pill ${c.status === 'passing' ? 'done' : ''}`}>{c.status}</span> {c.name}{c.detail ? <span className="muted"> — {c.detail}</span> : null}</li>
              ))}
            </ul>
            {checks.length === 0 ? <p className="empty">No checks yet.</p> : null}
            <details {...foldProps('check')}>
              <summary>Add a check</summary>
              <form className="row" onSubmit={addCheck}>
                <input type="text" name="name" placeholder="New check" aria-label="Check name" />
                <button className="go" type="submit">Add</button>
              </form>
            </details>
            {checks.length > 0 ? (
              <details {...foldProps('check-status')}>
                <summary>Update a check</summary>
                <form className="row" onSubmit={setCheck}>
                  <Entry label="Check">
                    <select name="check">
                      {checks.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </Entry>
                  <Entry label="Status">
                    <select name="status" defaultValue="passing">
                      <option value="passing">passing</option>
                      <option value="failing">failing</option>
                    </select>
                  </Entry>
                  <Entry label="Detail"><input type="text" name="detail" placeholder="detail" /></Entry>
                  <button className="ghost" type="submit">Update</button>
                </form>
              </details>
            ) : null}
          </>
        )}

        {tab === 'ship' && shipKind === 'sync' && (
          <>
            <h3>External refs</h3>
            <ul className="clean">
              {refs.map((r) => (
                <li key={r.id}>{r.entityKind}: {titleOf(r.entityKind, r.entityId)} <span className="pill">{r.service}</span> {r.externalId}</li>
              ))}
            </ul>
            {refs.length === 0 ? <p className="empty">No external refs yet.</p> : null}
            <details {...foldProps('ref')}>
              <summary>Attach a ref</summary>
              <form className="card" onSubmit={addRef}>
                <Entry label="Record"><select name="entity">{entityOptions}</select></Entry>
                <Entry label="Service"><input type="text" name="service" placeholder="github" defaultValue="github" /></Entry>
                <Entry label="External id"><input type="text" name="externalId" placeholder="owner/repo#123" /></Entry>
                <button className="go" type="submit">Attach</button>
              </form>
            </details>
            {syncResult ? <p>{syncResult}</p> : <p className="empty">Nothing pulled or pushed this session.</p>}
            <details {...foldProps('github')}>
              <summary>Connect a repository</summary>
              <form className="card" onSubmit={syncNow}>
                <Entry label="Owner"><input type="text" name="owner" placeholder="owner" /></Entry>
                <Entry label="Repository"><input type="text" name="repo" placeholder="repo" /></Entry>
                <Entry label="Token"><input type="password" name="token" placeholder="fine-grained PAT, issues read and write" autoComplete="off" /></Entry>
                <button className="go" type="submit" name="action" value="pull" disabled={syncing}>Pull issues</button>
                <button className="ghost" type="submit" name="action" value="push" disabled={syncing}>Push tasks</button>
              </form>
            </details>
          </>
        )}

        {tab === 'agents' && (
          <>
            <p className="muted">A run is recorded on Activity.</p>
            <form className="row" onSubmit={askAgent}>
              <Entry label="Task">
                <select name="task">
                  {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              </Entry>
              <Entry label="Goal"><input type="text" name="goal" placeholder="What should the agent do" /></Entry>
              <button className="go" type="submit" disabled={running || tasks.length === 0}>Ask agent</button>
            </form>
            <div className="row">
              <button className="ghost" onClick={runHousekeeping} disabled={running}>Run housekeeping</button>
              {runResult ? <span className="muted">{runResult}</span> : null}
            </div>
            <h3>Jobs</h3>
            <ul className="clean">
              {jobs.slice(0, 10).map((j) => (
                <li key={j.id}><span className="pill">{j.status}</span> {j.type}<span className="muted"> · attempts {j.attempts}</span>{j.result ? <span className="muted"> — {j.result.slice(0, 80)}</span> : null}</li>
              ))}
            </ul>
            {jobs.length === 0 ? <p className="empty">No jobs yet.</p> : null}
            <h3>Agents</h3>
            <ul className="clean">
              {agents.map((a) => (
                <li key={a.id}>
                  <span className="pill">{a.status}</span> {a.name}
                  {a.role ? <span className="muted"> — {a.role}</span> : null}
                  {a.model ? <span className="muted"> ({a.model})</span> : null}{' '}
                  <button className="ghost" onClick={() => toggleAgent(a)}>{a.status === 'active' ? 'pause' : 'resume'}</button>
                </li>
              ))}
            </ul>
            {agents.length === 0 ? <p className="empty">No agents yet.</p> : null}
            <details {...foldProps('agent')}>
              <summary>Register an agent</summary>
              <form className="row" onSubmit={addAgent}>
                <Entry label="Name"><input type="text" name="name" placeholder="Agent name" /></Entry>
                <Entry label="Role"><input type="text" name="role" placeholder="role" /></Entry>
                <button className="go" type="submit">Register</button>
              </form>
            </details>
            <p className="muted">Model: Ollama-local default (qwen2.5-coder:7b). Override with TIVITY_MODEL_PROVIDER, TIVITY_MODEL_NAME, TIVITY_MODEL_BASE_URL, and TIVITY_MODEL_API_KEY.</p>
          </>
        )}

        {tab === 'connectors' && (
          <>
            <p className="muted">Tivity keeps the record. Agents and workers connect over MCP. Their repositories stay where they are. Held neighbors need a stated MIT or Apache-2.0 license before they attach.</p>
            {(['built-in', 'attach', 'hold'] as const).map((stance) => (
              <section key={stance}>
                <h3>{stanceHeading(stance)}</h3>
                {CONNECTORS.filter((c) => c.stance === stance).map((c) => {
                  const config = connectorConfig(c);
                  return (
                    <details className="card connector" key={c.id} open={c.id === 'tivity-mcp' || c.id === 'mcp-bundle'}>
                      <summary>
                        <strong>{c.name}</strong>
                        <span className="pill">{c.license === 'this-app' ? 'this app' : c.license}</span>
                      </summary>
                      <p>{c.summary}</p>
                      <p className="where">{c.where}</p>
                      <p>{c.how}</p>
                      {c.id === 'tivity-mcp' ? <p>{TIVITY_MCP_TOOLS.join(' · ')}</p> : null}
                      {config ? (
                        <>
                          <pre className="config">{config}</pre>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => { void copyConnector(c); }}
                          >
                            {copiedConfigId === c.id ? 'Copied' : 'Copy config'}
                          </button>
                        </>
                      ) : null}
                    </details>
                  );
                })}
              </section>
            ))}
          </>
        )}

        {tab === 'tasks' && (
          <div className={selectedTask ? 'work-split' : undefined}>
            <div>
            <details {...foldProps('task')}>
              <summary>Add a task</summary>
              <form className="row" onSubmit={async (e) => {
                const title = String(new FormData(e.currentTarget).get('title') ?? '').trim();
                await addTask(e);
                if (title) setFold(null);
              }}>
                <label className="field">
                  <span>Task</span>
                  <input type="text" name="title" placeholder="What needs doing" aria-label="Task title" />
                </label>
                <button className="go" type="submit">Add</button>
              </form>
            </details>
            <div className="view-toggle" role="group" aria-label="Task view">
              <button type="button" className={taskView === 'list' ? 'ghost selected' : 'ghost'} aria-pressed={taskView === 'list'} onClick={() => setTaskView('list')}>List</button>
              <button
                type="button"
                className={showBoard ? 'ghost selected' : 'ghost'}
                aria-pressed={showBoard}
                disabled={tasks.length < 2}
                title={tasks.length < 2 ? 'A board needs at least two tasks' : 'Show To do, Doing, and Done'}
                onClick={() => setTaskView('board')}
              >
                Board
              </button>
            </div>
            {tasks.length === 0 ? <p className="empty">No tasks yet.</p> : null}
            {tasks.length > 0 && !showBoard ? (
              <ul className="task-list">
                {tasks.map((t) => (
                  <li key={t.id} id={searchHitElementId({ kind: 'task', id: t.id })} className={['task-row', selectedTaskId === t.id || isFocused('task', t.id) ? 'focused' : '', savingTaskId === t.id ? 'moving' : ''].filter(Boolean).join(' ')}>
                    <button type="button" className="task-select" aria-pressed={selectedTaskId === t.id} onClick={() => selectTask(t.id)}>{t.title}</button>
                    <span className={`pill ${t.status}`}>{columnLabel(t.status)}</span>
                    {taskStatusButton(t)}
                  </li>
                ))}
              </ul>
            ) : null}
            {showBoard ? (
              <div className="board">
                {(['todo', 'doing', 'done'] as const).map((status) => {
                  const column = tasks.filter((t) => t.status === status);
                  const label = columnLabel(status);
                  return (
                    <section className="column" key={status}>
                      <header>
                        <h3>{label}</h3>
                        <span className="pill">{column.length}</span>
                      </header>
                      {column.length === 0 ? <p className="muted">Nothing in {label}.</p> : column.map((t) => (
                        <article key={t.id} id={searchHitElementId({ kind: 'task', id: t.id })} className={['card', selectedTaskId === t.id || isFocused('task', t.id) ? 'focused' : '', savingTaskId === t.id ? 'moving' : ''].filter(Boolean).join(' ')}>
                          <button type="button" className="task-select" aria-pressed={selectedTaskId === t.id} onClick={() => selectTask(t.id)}>{t.title}</button>
                          {taskStatusButton(t)}
                        </article>
                      ))}
                    </section>
                  );
                })}
              </div>
            ) : null}
            </div>
            {selectedTask ? (
              <aside className="inspector" aria-label="Selected task">
                <h3>{selectedTask.title}</h3>
                <p><span className={`pill ${selectedTask.status}`}>{columnLabel(selectedTask.status)}</span></p>
                {taskStatusButton(selectedTask)}
                <button type="button" className="go" onClick={askAboutSelected}>Ask about this</button>
                <h4>Links</h4>
                {taskLinks.length === 0 ? <p className="muted">Nothing linked yet. Connect it from Links.</p> : (
                  <ul className="clean">
                    {taskLinks.map(({ link, other }) => (
                      <li key={link.id}>
                        <span className="pill">{link.relation}</span>{' '}
                        {other.kind === 'doc' ? (
                          <button type="button" className="ghost" onClick={() => setRevealedDocId(other.id)}>{titleOf(other.kind, other.id)}</button>
                        ) : (
                          <span>{other.kind}: {titleOf(other.kind, other.id)}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {revealedDoc ? (
                  <article id={`inspector-doc-${revealedDoc.id}`}>
                    <h4>{revealedDoc.title}</h4>
                    <p>{revealedDoc.body || 'This doc has no body yet.'}</p>
                  </article>
                ) : null}
              </aside>
            ) : null}
          </div>
        )}

        {tab === 'library' && (
          <>
            <div className="view-toggle" role="group" aria-label="Library type">
              <button type="button" className={libraryKind === 'doc' ? 'ghost selected' : 'ghost'} aria-pressed={libraryKind === 'doc'} onClick={() => setLibraryKind('doc')}>Docs</button>
              <button type="button" className={libraryKind === 'decision' ? 'ghost selected' : 'ghost'} aria-pressed={libraryKind === 'decision'} onClick={() => setLibraryKind('decision')}>Decisions</button>
            </div>
            {libraryKind === 'doc' ? (
              <>
                <details {...foldProps('doc')}>
                  <summary>Add a doc</summary>
                  <form className="card" onSubmit={async (e) => {
                    const title = String(new FormData(e.currentTarget).get('title') ?? '').trim();
                    await addDoc(e);
                    if (title) setFold(null);
                  }}>
                    <Entry label="Title"><input type="text" name="title" placeholder="Doc title" /></Entry>
                    <Entry label="Body"><textarea name="body" rows={3} placeholder="Body" /></Entry>
                    <button className="go" type="submit">Add doc</button>
                  </form>
                </details>
                {docs.map((d) => (
                  <div className={isFocused('doc', d.id) ? 'card focused' : 'card'} key={d.id} id={searchHitElementId({ kind: 'doc', id: d.id })}>
                    <h3>{d.title}</h3>
                    <p>{d.body || <span className="muted">Empty.</span>}</p>
                  </div>
                ))}
                {docs.length === 0 ? <p className="empty">No docs yet.</p> : null}
              </>
            ) : (
              <>
                <details {...foldProps('decision')}>
                  <summary>Add a decision</summary>
                  <form className="card" onSubmit={async (e) => {
                    const title = String(new FormData(e.currentTarget).get('title') ?? '').trim();
                    await addDecision(e);
                    if (title) setFold(null);
                  }}>
                    <Entry label="Title"><input type="text" name="title" placeholder="Decision title" /></Entry>
                    <Entry label="Context"><textarea name="context" rows={2} placeholder="Context" /></Entry>
                    <Entry label="Verdict"><input type="text" name="verdict" placeholder="Verdict" /></Entry>
                    <button className="go" type="submit">Record</button>
                  </form>
                </details>
                {decisions.map((d) => (
                  <div className="card" key={d.id}>
                    <h3>{d.title}</h3>
                    <p>{d.context}</p>
                    <p><strong>Verdict:</strong> {d.verdict}</p>
                  </div>
                ))}
                {decisions.length === 0 ? <p className="empty">No decisions yet.</p> : null}
              </>
            )}
          </>
        )}

        {tab === 'activity' && (
          <>
            <div className="view-toggle" role="group" aria-label="Activity kind">
              <button type="button" className={activityKind === 'evidence' ? 'ghost selected' : 'ghost'} aria-pressed={activityKind === 'evidence'} onClick={() => setActivityKind('evidence')}>Evidence</button>
              <button type="button" className={activityKind === 'memory' ? 'ghost selected' : 'ghost'} aria-pressed={activityKind === 'memory'} onClick={() => setActivityKind('memory')}>Memory</button>
              <button type="button" className={activityKind === 'runs' ? 'ghost selected' : 'ghost'} aria-pressed={activityKind === 'runs'} onClick={() => setActivityKind('runs')}>Runs</button>
            </div>
            {activityKind === 'evidence' ? (
              <>
                <details {...foldProps('evidence')}>
                  <summary>Add evidence</summary>
                  <form className="card" onSubmit={async (e) => {
                    const title = String(new FormData(e.currentTarget).get('title') ?? '').trim();
                    await addEvidence(e);
                    if (title) setFold(null);
                  }}>
                    <Entry label="Title"><input type="text" name="title" placeholder="Evidence title" /></Entry>
                    <Entry label="Source"><input type="text" name="source" placeholder="URL, doc, or person" /></Entry>
                    <Entry label="Detail"><textarea name="detail" rows={2} placeholder="Detail" /></Entry>
                    <button className="go" type="submit">Add evidence</button>
                  </form>
                </details>
                {evidence.map((item) => (
                  <div className="card" key={item.id}>
                    <h3>{item.title}</h3>
                    {item.source ? <p><strong>Source:</strong> {item.source}</p> : null}
                    <p>{item.detail || <span className="muted">Empty.</span>}</p>
                  </div>
                ))}
                {evidence.length === 0 ? <p className="empty">No evidence yet.</p> : null}
              </>
            ) : null}
            {activityKind === 'memory' ? (
              <>
                <details {...foldProps('memory')}>
                  <summary>Add memory</summary>
                  <form className="card" onSubmit={async (e) => {
                    const content = String(new FormData(e.currentTarget).get('content') ?? '').trim();
                    await addMemory(e);
                    if (content) setFold(null);
                  }}>
                    <Entry label="Kind"><input type="text" name="kind" placeholder="note" /></Entry>
                    <Entry label="What happened"><input type="text" name="content" placeholder="What happened and why" /></Entry>
                    <button className="go" type="submit">Append</button>
                  </form>
                </details>
                <ul className="clean">
                  {memory.map((m) => (
                    <li key={m.id} id={searchHitElementId({ kind: 'memory', id: m.id })} className={isFocused('memory', m.id) ? 'focused' : undefined}>
                      <span className="pill">{m.kind}</span> {m.content}
                    </li>
                  ))}
                </ul>
                {memory.length === 0 ? <p className="empty">No memory yet.</p> : null}
              </>
            ) : null}
            {activityKind === 'runs' ? (
              <>
                <p className="muted">Runs are recorded when an agent works. Register an agent on Agents and start it.</p>
                <ul className="clean">
                  {runs.slice(0, 15).map((r) => (
                    <li key={r.id}><span className={`pill ${r.status === 'done' ? 'done' : ''}`}>{r.status}</span> {agents.find((a) => a.id === r.agentId)?.name ?? shortId(r.agentId)}<span className="muted"> — {r.summary || 'running…'}</span></li>
                  ))}
                </ul>
                {runs.length === 0 ? <p className="empty">No runs yet. Register an agent on Agents and start it.</p> : null}
              </>
            ) : null}
          </>
        )}

        {tab === 'links' && (
          <>
            <h3>Review queue</h3>
            <ul className="clean">
              {queue.filter((q) => q.status === 'pending').map((q) => (
                <li key={q.id}>
                  {q.entityKind}: {titleOf(q.entityKind, q.entityId)}{' '}
                  <span className="muted">({q.reason})</span>{' '}
                  <button className="ghost" onClick={() => resolveQueue(q.id, 'accepted')}>accept</button>{' '}
                  <button className="ghost" onClick={() => resolveQueue(q.id, 'dismissed')}>dismiss</button>
                </li>
              ))}
            </ul>
            {pending === 0 ? <p className="empty">Nothing is waiting.</p> : null}
            <h3>Links</h3>
            <ul className="clean">
              {links.map((l) => (
                <li key={l.id}>
                  {l.fromKind}: {titleOf(l.fromKind, l.fromId)} <span className="pill">{l.relation}</span> →{' '}
                  {l.toKind}: {titleOf(l.toKind, l.toId)}
                </li>
              ))}
            </ul>
            {links.length === 0 ? <p className="empty">No links yet.</p> : null}
            <details {...foldProps('link')}>
              <summary>Add a link</summary>
              <form className="card" onSubmit={addLink}>
                <Entry label="From"><select name="from">{entityOptions}</select></Entry>
                <Entry label="Relation"><input type="text" name="relation" placeholder="drives" /></Entry>
                <Entry label="To"><select name="to">{entityOptions}</select></Entry>
                <button className="go" type="submit">Link</button>
              </form>
            </details>
            <h3>Impact</h3>
            <form className="row" onSubmit={checkImpact}>
              <Entry label="Record"><select name="entity">{entityOptions}</select></Entry>
              <button className="ghost" type="submit">What does it touch?</button>
            </form>
            <ul className="clean">
              {impact.map((r) => (
                <li key={`${r.kind}:${r.id}`}>{r.kind}: {titleOf(r.kind, r.id)}</li>
              ))}
            </ul>
            {impact.length === 0 ? <p className="empty">Pick a record to see what it touches.</p> : null}
          </>
        )}
        </div>
      </main>
    </div>
  );
}
