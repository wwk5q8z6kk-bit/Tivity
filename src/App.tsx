import { useEffect, useState, type FormEvent } from 'react';
import type { Decision, DesignComponent, Doc, EntityKind, EvidenceItem, ExternalRef, ImpactItem, Link, MemoryEntry, Milestone, MonitorCheck, Project, PullRequest, QualityGate, Release, Requirement, RequirementVersion, Screen, SecurityFinding, Sprint, Task, TestCase, TestRun } from './core/types';
import { createStore, type Store } from './core/store';
import { findImpacted, shortId, type EntityRef } from './core/links';

type Tab = 'tasks' | 'docs' | 'decisions' | 'memory' | 'links' | 'requirements' | 'evidence' | 'delivery' | 'design' | 'quality';

const NEXT_STATUS = { todo: 'doing', doing: 'done', done: 'todo' } as const;
const NEXT_SPRINT = { planned: 'active', active: 'closed', closed: 'planned' } as const;
const NEXT_PR = { open: 'merged', merged: 'closed', closed: 'open' } as const;
const NEXT_GATE = { pending: 'pass', pass: 'fail', fail: 'pending' } as const;
const NEXT_FINDING = { open: 'fixed', fixed: 'dismissed', dismissed: 'open' } as const;
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'requirements', label: 'Requirements' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'docs', label: 'Docs' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'design', label: 'Design' },
  { id: 'quality', label: 'Quality' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'memory', label: 'Memory' },
  { id: 'links', label: 'Links' },
];

export default function App() {
  const [store, setStore] = useState<Store | null>(null);
  const [backend, setBackend] = useState('…');
  const [error, setError] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState('');
  const [tab, setTab] = useState<Tab>('tasks');
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
    setImpact([]);
  }, [store, activeId]);

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
      const [t, d, dec, m, l, rs, ev, q, sp, ms, pr, rel, refs, scr, cmp, tc, gt, sf, mc] = await Promise.all([
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
      e.currentTarget.reset();
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
      e.currentTarget.reset();
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  async function cycleTask(t: Task): Promise<void> {
    if (!store) return;
    try {
      await store.setTaskStatus(t.id, NEXT_STATUS[t.status]);
      await reloadActive();
    } catch (err) {
      report(err);
    }
  }

  async function addDoc(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!store || !activeId) return;
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get('title') ?? '').trim();
    if (!title) return;
    try {
      await store.createDoc(activeId, title, String(fd.get('body') ?? ''));
      e.currentTarget.reset();
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
      e.currentTarget.reset();
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
      e.currentTarget.reset();
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
      e.currentTarget.reset();
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
      e.currentTarget.reset();
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
      e.currentTarget.reset();
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
      e.currentTarget.reset();
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
      e.currentTarget.reset();
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
      e.currentTarget.reset();
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
      e.currentTarget.reset();
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
      e.currentTarget.reset();
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
      e.currentTarget.reset();
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
      e.currentTarget.reset();
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
      e.currentTarget.reset();
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
      e.currentTarget.reset();
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
      e.currentTarget.reset();
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
      e.currentTarget.reset();
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

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>Tivity<span>.</span></h1>
        <div className="backend">storage: {backend}</div>
        {projects.map((p) => (
          <button
            key={p.id}
            className={p.id === activeId ? 'proj active' : 'proj'}
            onClick={() => setActiveId(p.id)}
          >
            {p.name}
            {p.summary ? <small>{p.summary}</small> : null}
          </button>
        ))}
        <form className="row" onSubmit={addProject}>
          <input type="text" name="name" placeholder="New project" />
          <button className="go" type="submit">+</button>
        </form>
      </aside>
      <main className="main">
        <h2>{active ? active.name : 'No project selected'}</h2>
        {error ? <p className="error">{error}</p> : null}
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'requirements' && (
          <>
            <form className="card" onSubmit={addRequirement}>
              <div className="row"><input type="text" name="title" placeholder="Requirement title" /></div>
              <div className="row" style={{ marginTop: 8 }}>
                <textarea name="body" rows={2} placeholder="Body" />
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <input type="text" name="acceptance" placeholder="Acceptance criteria" />
              </div>
              <div className="row" style={{ marginTop: 8 }}><button className="go" type="submit">Add requirement</button></div>
            </form>
            <div className="row">
              {requirements.map((r) => (
                <button key={r.id} className="ghost" onClick={() => setActiveReqId(r.id)} style={r.id === activeReqId ? { borderColor: 'var(--accent)', color: 'var(--text)' } : undefined}>
                  {r.title} <span className="pill">v{r.currentVersion}</span>
                </button>
              ))}
            </div>
            {activeReq == null ? <p className="muted">No requirement selected.</p> : (
              <>
                <h3>{activeReq.title} <span className="pill">{activeReq.status}</span></h3>
                {versions.map((v) => (
                  <div className="card" key={v.id}>
                    <h3>v{v.version}</h3>
                    <p>{v.body || <span className="muted">Empty.</span>}</p>
                    {v.acceptance ? <p><strong>Acceptance:</strong> {v.acceptance}</p> : null}
                  </div>
                ))}
                <form className="card" onSubmit={addVersion}>
                  <div className="row"><textarea name="body" rows={2} placeholder="New version body — saving propagates to linked items" /></div>
                  <div className="row" style={{ marginTop: 8 }}><input type="text" name="acceptance" placeholder="Acceptance criteria" /></div>
                  <div className="row" style={{ marginTop: 8 }}><button className="go" type="submit">Save v{activeReq.currentVersion + 1}</button></div>
                </form>
              </>
            )}
          </>
        )}

        {tab === 'evidence' && (
          <>
            <form className="card" onSubmit={addEvidence}>
              <div className="row"><input type="text" name="title" placeholder="Evidence title" /></div>
              <div className="row" style={{ marginTop: 8 }}><input type="text" name="source" placeholder="Source (URL, doc, person)" /></div>
              <div className="row" style={{ marginTop: 8 }}><textarea name="detail" rows={2} placeholder="Detail" /></div>
              <div className="row" style={{ marginTop: 8 }}><button className="go" type="submit">Add evidence</button></div>
            </form>
            {evidence.map((e) => (
              <div className="card" key={e.id}>
                <h3>{e.title}</h3>
                {e.source ? <p><strong>Source:</strong> {e.source}</p> : null}
                <p>{e.detail || <span className="muted">Empty.</span>}</p>
              </div>
            ))}
            {evidence.length === 0 ? <p className="muted">No evidence yet.</p> : null}
          </>
        )}

        {tab === 'delivery' && (
          <>
            <h3>Sprints</h3>
            <form className="row" onSubmit={addSprint}>
              <input type="text" name="name" placeholder="New sprint" />
              <button className="go" type="submit">Add</button>
            </form>
            <ul className="clean">
              {sprints.map((s) => (
                <li key={s.id}>
                  <span className={`pill ${s.status === 'active' ? 'doing' : s.status === 'closed' ? 'done' : ''}`}>{s.status}</span>{' '}
                  {s.name}{' '}
                  <button className="ghost" onClick={() => advanceSprint(s)}>advance</button>
                </li>
              ))}
            </ul>
            <h3>Milestones</h3>
            <form className="row" onSubmit={addMilestone}>
              <input type="text" name="name" placeholder="New milestone" />
              <button className="go" type="submit">Add</button>
            </form>
            <ul className="clean">
              {milestones.map((x) => (
                <li key={x.id}><span className="pill">{x.status}</span> {x.name}</li>
              ))}
            </ul>
            <h3>Pull requests</h3>
            <form className="row" onSubmit={addPR}>
              <input type="text" name="title" placeholder="PR title" />
              <input type="text" name="branch" placeholder="branch" style={{ maxWidth: 160 }} />
              <button className="go" type="submit">Add</button>
            </form>
            <ul className="clean">
              {prs.map((p) => (
                <li key={p.id}>
                  <span className={`pill ${p.status === 'merged' ? 'done' : p.status === 'open' ? 'doing' : ''}`}>{p.status}</span>{' '}
                  {p.title}{p.branch ? <span className="muted"> ({p.branch})</span> : null}{' '}
                  <button className="ghost" onClick={() => advancePR(p)}>advance</button>
                </li>
              ))}
            </ul>
            <h3>Releases</h3>
            <form className="row" onSubmit={addRelease}>
              <input type="text" name="name" placeholder="Release name" />
              <input type="text" name="notes" placeholder="notes" />
              <button className="go" type="submit">Add</button>
            </form>
            <ul className="clean">
              {releases.map((r) => (
                <li key={r.id}><span className="pill">{r.status}</span> {r.name}{r.notes ? <span className="muted"> — {r.notes}</span> : null}</li>
              ))}
            </ul>
            <h3>External refs</h3>
            <form className="card" onSubmit={addRef}>
              <div className="row">
                <select name="entity">{entityOptions}</select>
                <input type="text" name="service" placeholder="service" defaultValue="github" style={{ maxWidth: 110 }} />
                <input type="text" name="externalId" placeholder="owner/repo#123" />
                <button className="go" type="submit">Attach</button>
              </div>
            </form>
            <ul className="clean">
              {refs.map((r) => (
                <li key={r.id}>{r.entityKind}: {titleOf(r.entityKind, r.entityId)} <span className="pill">{r.service}</span> {r.externalId}</li>
              ))}
            </ul>
          </>
        )}

        {tab === 'design' && (
          <>
            <p className="muted">Screens and components link together in the Links tab (contains, navigatesTo) and join impact checks automatically.</p>
            <h3>Screens</h3>
            <form className="row" onSubmit={addScreen}>
              <input type="text" name="name" placeholder="Screen name" />
              <input type="text" name="route" placeholder="route" style={{ maxWidth: 160 }} />
              <button className="go" type="submit">Add</button>
            </form>
            <ul className="clean">
              {screens.map((s) => (
                <li key={s.id}>{s.name}{s.route ? <span className="muted"> ({s.route})</span> : null}{s.notes ? <span className="muted"> — {s.notes}</span> : null}</li>
              ))}
            </ul>
            <h3>Components</h3>
            <form className="row" onSubmit={addComponent}>
              <input type="text" name="name" placeholder="Component name" />
              <input type="text" name="kind" placeholder="kind (ui)" style={{ maxWidth: 120 }} />
              <button className="go" type="submit">Add</button>
            </form>
            <ul className="clean">
              {designComponents.map((c) => (
                <li key={c.id}><span className="pill">{c.kind}</span> {c.name}{c.notes ? <span className="muted"> — {c.notes}</span> : null}</li>
              ))}
            </ul>
          </>
        )}

        {tab === 'quality' && (
          <>
            <p className="muted">Statuses below are human-recorded until CI and agent feeds arrive in M4 — no fake automation.</p>
            <h3>Tests</h3>
            <form className="row" onSubmit={addTestCase}>
              <input type="text" name="title" placeholder="New test case" />
              <button className="go" type="submit">Add</button>
            </form>
            <div className="row">
              {testCases.map((c) => (
                <button key={c.id} className="ghost" onClick={() => setActiveCaseId(c.id)} style={c.id === activeCaseId ? { borderColor: 'var(--accent)', color: 'var(--text)' } : undefined}>
                  {c.title} <span className="pill">{c.status}</span>
                </button>
              ))}
            </div>
            {activeCase == null ? <p className="muted">No test case selected.</p> : (
              <>
                <ul className="clean">
                  {testRuns.map((r) => (
                    <li key={r.id}><span className={`pill ${r.status === 'pass' ? 'done' : ''}`}>{r.status}</span> {r.note || <span className="muted">no note</span>}</li>
                  ))}
                </ul>
                <form className="row" onSubmit={recordRun}>
                  <select name="status" defaultValue="pass">
                    <option value="pass">pass</option>
                    <option value="fail">fail</option>
                  </select>
                  <input type="text" name="note" placeholder="run note" />
                  <button className="go" type="submit">Record run</button>
                </form>
              </>
            )}
            <h3>Quality gates</h3>
            <form className="row" onSubmit={addGate}>
              <input type="text" name="name" placeholder="New gate" />
              <button className="go" type="submit">Add</button>
            </form>
            <ul className="clean">
              {gates.map((g) => (
                <li key={g.id}>
                  <span className={`pill ${g.status === 'pass' ? 'done' : g.status === 'pending' ? 'doing' : ''}`}>{g.status}</span>{' '}
                  {g.name}{' '}
                  <button className="ghost" onClick={() => advanceGate(g)}>advance</button>
                </li>
              ))}
            </ul>
            <h3>Security findings</h3>
            <form className="row" onSubmit={addFinding}>
              <input type="text" name="title" placeholder="Finding title" />
              <input type="text" name="severity" placeholder="severity" style={{ maxWidth: 120 }} />
              <button className="go" type="submit">Add</button>
            </form>
            <ul className="clean">
              {findings.map((f) => (
                <li key={f.id}>
                  <span className="pill">{f.severity}</span> <span className="pill">{f.status}</span>{' '}
                  {f.title}{' '}
                  <button className="ghost" onClick={() => advanceFinding(f)}>advance</button>
                </li>
              ))}
            </ul>
            <h3>Monitor checks</h3>
            <form className="row" onSubmit={addCheck}>
              <input type="text" name="name" placeholder="New check" />
              <button className="go" type="submit">Add</button>
            </form>
            <ul className="clean">
              {checks.map((c) => (
                <li key={c.id}><span className={`pill ${c.status === 'passing' ? 'done' : ''}`}>{c.status}</span> {c.name}{c.detail ? <span className="muted"> — {c.detail}</span> : null}</li>
              ))}
            </ul>
            {checks.length > 0 ? (
              <form className="row" onSubmit={setCheck}>
                <select name="check">
                  {checks.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select name="status" defaultValue="passing">
                  <option value="passing">passing</option>
                  <option value="failing">failing</option>
                </select>
                <input type="text" name="detail" placeholder="detail" />
                <button className="ghost" type="submit">Update</button>
              </form>
            ) : null}
          </>
        )}

        {tab === 'tasks' && (
          <>
            <form className="row" onSubmit={addTask}>
              <input type="text" name="title" placeholder="New task" />
              <button className="go" type="submit">Add</button>
            </form>
            <ul className="clean">
              {tasks.map((t) => (
                <li key={t.id}>
                  <span className={`pill ${t.status}`}>{t.status}</span>{' '}
                  {t.title}{' '}
                  <button className="ghost" onClick={() => cycleTask(t)}>advance</button>
                </li>
              ))}
            </ul>
            {tasks.length === 0 ? <p className="muted">No tasks yet.</p> : null}
          </>
        )}

        {tab === 'docs' && (
          <>
            <form className="card" onSubmit={addDoc}>
              <div className="row"><input type="text" name="title" placeholder="Doc title" /></div>
              <div className="row" style={{ marginTop: 8 }}>
                <textarea name="body" rows={3} placeholder="Body" />
              </div>
              <div className="row" style={{ marginTop: 8 }}><button className="go" type="submit">Add doc</button></div>
            </form>
            {docs.map((d) => (
              <div className="card" key={d.id}>
                <h3>{d.title}</h3>
                <p>{d.body || <span className="muted">Empty.</span>}</p>
              </div>
            ))}
            {docs.length === 0 ? <p className="muted">No docs yet.</p> : null}
          </>
        )}

        {tab === 'decisions' && (
          <>
            <form className="card" onSubmit={addDecision}>
              <div className="row"><input type="text" name="title" placeholder="Decision title" /></div>
              <div className="row" style={{ marginTop: 8 }}>
                <textarea name="context" rows={2} placeholder="Context" />
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <input type="text" name="verdict" placeholder="Verdict" />
              </div>
              <div className="row" style={{ marginTop: 8 }}><button className="go" type="submit">Record</button></div>
            </form>
            {decisions.map((d) => (
              <div className="card" key={d.id}>
                <h3>{d.title}</h3>
                <p>{d.context}</p>
                <p><strong>Verdict:</strong> {d.verdict}</p>
              </div>
            ))}
            {decisions.length === 0 ? <p className="muted">No decisions yet.</p> : null}
          </>
        )}

        {tab === 'memory' && (
          <>
            <form className="card" onSubmit={addMemory}>
              <div className="row">
                <input type="text" name="kind" placeholder="kind (note)" style={{ maxWidth: 140 }} />
                <input type="text" name="content" placeholder="What happened and why" />
                <button className="go" type="submit">Append</button>
              </div>
            </form>
            <ul className="clean">
              {memory.map((m) => (
                <li key={m.id}><span className="pill">{m.kind}</span> {m.content}</li>
              ))}
            </ul>
            {memory.length === 0 ? <p className="muted">No memory entries yet.</p> : null}
          </>
        )}

        {tab === 'links' && (
          <>
            <form className="card" onSubmit={addLink}>
              <div className="row">
                <select name="from">{entityOptions}</select>
                <input type="text" name="relation" placeholder="relation" style={{ maxWidth: 130 }} />
                <select name="to">{entityOptions}</select>
                <button className="go" type="submit">Link</button>
              </div>
            </form>
            <ul className="clean">
              {links.map((l) => (
                <li key={l.id}>
                  {l.fromKind}: {titleOf(l.fromKind, l.fromId)} <span className="pill">{l.relation}</span> →{' '}
                  {l.toKind}: {titleOf(l.toKind, l.toId)}
                </li>
              ))}
            </ul>
            {links.length === 0 ? <p className="muted">No links yet.</p> : null}
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
            {queue.filter((q) => q.status === 'pending').length === 0 ? <p className="muted">Queue empty — no silent drift.</p> : null}
            <h3>Impact check</h3>
            <form className="row" onSubmit={checkImpact}>
              <select name="entity">{entityOptions}</select>
              <button className="ghost" type="submit">What does it touch?</button>
            </form>
            <ul className="clean">
              {impact.map((r) => (
                <li key={`${r.kind}:${r.id}`}>{r.kind}: {titleOf(r.kind, r.id)}</li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
