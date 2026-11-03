import type { Job, Store } from '@tivity/core';

// Lease-claim runner (AWR pattern, SQLite-local): claims due jobs one at a
// time, executes the registered handler, and audits every attempt as an
// agent run. Failures requeue with backoff until attempts run out.

export const MAX_ATTEMPTS = 3;
export const LEASE_MS = 60_000;

export type JobHandler = (
  store: Store,
  projectId: string,
  job: Job,
) => Promise<{ summary: string }>;

export interface RunOutcome {
  ran: number;
  failed: number;
}

export async function runDueJobs(
  store: Store,
  projectId: string,
  agentId: string,
  handlers: Record<string, JobHandler>,
  nowMs: number = Date.now(),
): Promise<RunOutcome> {
  let ran = 0;
  let failed = 0;
  for (;;) {
    const job = await store.claimDueJob(projectId, nowMs);
    if (!job) break;
    const run = await store.startAgentRun(projectId, {
      agentId,
      jobId: job.id,
      summary: `${job.type} started (attempt ${job.attempts})`,
    });
    const handler = handlers[job.type];
    try {
      if (!handler) throw new Error(`no handler for job type: ${job.type}`);
      const out = await handler(store, projectId, job);
      await store.completeJob(job.id, 'done', out.summary);
      await store.finishAgentRun(run.id, { status: 'done', summary: out.summary });
      ran += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (job.attempts < MAX_ATTEMPTS) {
        await store.requeueJob(job.id, nowMs + 30_000 * job.attempts);
        await store.finishAgentRun(run.id, {
          status: 'failed',
          summary: `attempt ${job.attempts} failed: ${message} — requeued`,
        });
      } else {
        await store.completeJob(job.id, 'failed', message);
        await store.finishAgentRun(run.id, { status: 'failed', summary: message });
      }
      failed += 1;
    }
  }
  return { ran, failed };
}
