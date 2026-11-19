import { useEffect, useRef, useState } from 'react';
import type { Store, Task } from '@tivity/core';

interface Review {
  task: Task;
  status: Task['status'];
  namespace: string;
}

export function VaultStatusReview({ projectId, store, onApplied }: {
  projectId: string; store: Store; onApplied: (taskId: string) => void;
}) {
  const [review, setReview] = useState<Review | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let version = 0;
    async function receive(event: MessageEvent) {
      const data = event.data;
      if (window.parent === window || event.source !== window.parent || event.origin !== window.location.origin ||
          data?.type !== 'tivity.review-status.v1' || typeof data.taskId !== 'string' ||
          typeof data.projectId !== 'string' || typeof data.namespace !== 'string' ||
          !['todo', 'doing', 'done'].includes(data.status)) return;
      const current = ++version;
      setReview(null);
      setMessage('');
      try {
        const tasks = data.projectId === projectId ? await store.listTasks(projectId) : [];
        if (version !== current) return;
        const task = tasks.find(t => t.id === data.taskId && t.projectId === data.projectId);
        if (!task) setMessage('Open the original board project to review this task.');
        else if (task.status === data.status) setMessage('The board and vault already show the same status for ' + task.title + '.');
        else setReview({ task: { ...task }, status: data.status, namespace: data.namespace });
      } catch {
        if (version === current) setMessage('Could not read the board task.');
      }
    }
    window.addEventListener('message', receive);
    return () => { version++; window.removeEventListener('message', receive); };
  }, [projectId, store]);
  useEffect(() => { if (review || message) region.current?.focus(); }, [review, message]);
  if (!review && !message) return null;
  async function apply() {
    if (!review || busy) return;
    setBusy(true);
    try {
      const applied = await store.applyReviewedTaskStatus(review.task, review.status);
      setMessage(applied ? 'Board status updated.' : 'The board changed after review. Compare again to review the latest board status.');
      if (applied) onApplied(review.task.id);
      setReview(null);
    } catch {
      setMessage('Could not save the status to the board.');
    } finally { setBusy(false); }
  }
  return <div ref={region} tabIndex={-1} role="region" aria-label="Vault status review" className="sheet">
    {review && <>
      <h3>{review.task.title}</h3>
      <p>Board: {review.task.status}. Vault ({review.namespace}): {review.status}.</p>
      <button className="go" disabled={busy} onClick={() => void apply()}>Apply vault status</button>
    </>}
    {message && <p role="status">{message}</p>}
    <button className="ghost" disabled={busy} onClick={() => { setReview(null); setMessage(''); }}>Dismiss</button>
  </div>;
}
