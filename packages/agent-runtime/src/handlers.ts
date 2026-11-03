import type { Job, Store } from '@tivity/core';
import type { JobHandler } from './runner';

// Local rule handlers: deterministic, offline, no model calls. They prove the
// ledger + audit semantics; LLM handlers reuse the same runner in M4b.

async function housekeeping(store: Store, projectId: string, _job: Job): Promise<{ summary: string }> {
  const [tasks, queue, findings] = await Promise.all([
    store.listTasks(projectId),
    store.listImpact(projectId),
    store.listSecurityFindings(projectId),
  ]);
  const open = tasks.filter((t) => t.status !== 'done').length;
  const pending = queue.filter((q) => q.status === 'pending').length;
  const openFindings = findings.filter((f) => f.status === 'open').length;
  const summary = `Housekeeping: ${open} open tasks, ${pending} pending reviews, ${openFindings} open findings.`;
  await store.appendMemory(projectId, 'agent', summary);
  return { summary };
}

async function impactNudge(store: Store, projectId: string, _job: Job): Promise<{ summary: string }> {
  const queue = await store.listImpact(projectId);
  const pending = queue.filter((q) => q.status === 'pending');
  const top = pending.slice(0, 3).map((q) => `${q.entityKind} (${q.reason})`).join('; ');
  const summary = pending.length === 0
    ? 'Impact nudge: queue is clear, nothing waiting for review.'
    : `Impact nudge: ${pending.length} waiting for review. Top: ${top}`;
  await store.appendMemory(projectId, 'agent', summary);
  return { summary };
}

export const localHandlers: Record<string, JobHandler> = {
  housekeeping,
  'impact-nudge': impactNudge,
};
