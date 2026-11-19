import { useEffect, useState, type FormEvent } from 'react';
import type { Store, Task, TaskComment } from '@tivity/core';

export function TaskDiscussion({ store, task }: { store: Store; task: Task }) {
  const [comments, setComments] = useState<TaskComment[] | null>(null);
  const [author, setAuthor] = useState('You');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    store.listTaskComments(task.projectId, task.id)
      .then((items) => { if (!cancelled) setComments(items); })
      .catch((err: unknown) => { if (!cancelled) setError(String(err)); });
    return () => { cancelled = true; };
  }, [store, task.projectId, task.id]);

  async function refresh(): Promise<void> {
    setBusy(true);
    setError('');
    try { setComments(await store.listTaskComments(task.projectId, task.id)); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }

  async function post(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (busy || comments === null || !author.trim() || !body.trim()) return;
    setBusy(true);
    setError('');
    try {
      const comment = await store.addTaskComment(task.projectId, task.id, { author, body });
      setComments((current) => [...(current ?? []), comment]);
      setBody('');
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }

  return (
    <section className="discussion" aria-label="Task discussion" aria-busy={busy}>
      <div className="discussion-head">
        <h4>Discussion{comments ? ` · ${comments.length}` : ''}</h4>
        <button type="button" className="ghost" disabled={busy} onClick={() => { void refresh(); }}>Refresh discussion</button>
      </div>
      {error ? <p role="alert" className="error">{error}</p> : null}
      {comments === null ? <p className="muted">Loading discussion…</p> : comments.length === 0 ? <p className="muted">No comments yet.</p> : (
        <ol className="discussion-list">
          {comments.map((comment) => (
            <li key={comment.id}>
              <div className="discussion-byline">
                <strong>{comment.author}</strong>
                <time dateTime={new Date(comment.createdAt).toISOString()}>{new Date(comment.createdAt).toLocaleString()}</time>
              </div>
              <p>{comment.body}</p>
            </li>
          ))}
        </ol>
      )}
      <form className="discussion-form" onSubmit={(e) => { void post(e); }}>
        <label className="field stack"><span>Name</span>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} required disabled={busy} />
        </label>
        <label className="field stack"><span>Comment</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} required disabled={busy} placeholder="Share context, ask a question, or record a handoff" />
        </label>
        <button className="go" type="submit" disabled={busy || comments === null || !author.trim() || !body.trim()}>{busy ? 'Saving…' : 'Post comment'}</button>
      </form>
    </section>
  );
}
