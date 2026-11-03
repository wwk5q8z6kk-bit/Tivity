import { useEffect, useState, type FormEvent } from 'react';
import type { Decision, Doc, EntityKind, Link, MemoryEntry, Project, Task } from './core/types';
import { createStore, type Store } from './core/store';
import { findImpacted, shortId, type EntityRef } from './core/links';

type Tab = 'tasks' | 'docs' | 'decisions' | 'memory' | 'links';

const NEXT_STATUS = { todo: 'doing', doing: 'done', done: 'todo' } as const;
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'docs', label: 'Docs' },
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
    setImpact([]);
  }, [store, activeId]);

  async function reloadActive(): Promise<void> {
    if (!store || !activeId) return;
    try {
      const [t, d, dec, m, l] = await Promise.all([
        store.listTasks(activeId),
        store.listDocs(activeId),
        store.listDecisions(activeId),
        store.listMemory(activeId),
        store.listLinks(activeId),
      ]);
      setTasks(t);
      setDocs(d);
      setDecisions(dec);
      setMemory(m);
      setLinks(l);
    } catch (e) {
      report(e);
    }
  }

  function titleOf(kind: EntityKind, id: string): string {
    if (kind === 'task') return tasks.find((t) => t.id === id)?.title ?? shortId(id);
    if (kind === 'doc') return docs.find((d) => d.id === id)?.title ?? shortId(id);
    if (kind === 'decision') return decisions.find((d) => d.id === id)?.title ?? shortId(id);
    if (kind === 'memory') return memory.find((m) => m.id === id)?.content.slice(0, 40) ?? shortId(id);
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

  const active = projects.find((p) => p.id === activeId);
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
