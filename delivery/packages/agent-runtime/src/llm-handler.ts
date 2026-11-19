import type { Job, Store } from '@tivity/core';
import { generateDirect, modelApiKey, readTaskContextImpl, resolveModelConfig } from './llm-core';

// `agent-task` job: payload { taskId, goal? }. Reads linked context, generates
// an answer, writes a memory note. Note-only side effects — entities are
// never auto-mutated (decision 0019). Default path uses direct fetch, which
// works in Node workers and browser dev; the desktop app overrides with a
// Tauri-native call (see apps/desktop/src/agent-task.ts) to dodge webview CORS.

export async function executeAgentTask(
  store: Store,
  projectId: string,
  job: Job,
  generateText: (prompt: string) => Promise<string>,
): Promise<{ summary: string }> {
  let payload: { taskId?: string; goal?: string };
  try {
    payload = JSON.parse(job.payload) as { taskId?: string; goal?: string };
  } catch {
    throw new Error(`agent-task payload is not JSON: ${job.payload.slice(0, 80)}`);
  }
  if (!payload.taskId) throw new Error('agent-task payload needs { taskId, goal? }');
  const ctx = await readTaskContextImpl(store, projectId, payload.taskId);
  const goal = payload.goal?.trim() || 'Summarize status and suggest next steps.';
  const linked = ctx.linked.map((l) => `- ${l.kind} (${l.relation}): ${l.title}`).join('\n') || '(nothing linked)';
  const prompt = `Task: ${ctx.title} [${ctx.status}]\nGoal: ${goal}\nLinked:\n${linked}`;
  const text = (await generateText(prompt)).trim();
  const clipped = text.length > 600 ? `${text.slice(0, 600)}…` : text;
  await store.appendMemory(projectId, 'agent', `Agent on "${ctx.title}": ${clipped}`);
  return { summary: `Agent answered "${ctx.title}" (${text.length} chars).` };
}

export async function agentTask(store: Store, projectId: string, job: Job): Promise<{ summary: string }> {
  const config = resolveModelConfig();
  if (!config.hasKey) {
    throw new Error(`${config.provider} provider needs TIVITY_MODEL_API_KEY (or OPENAI_API_KEY) — nothing was called.`);
  }
  const key = modelApiKey(config);
  return executeAgentTask(store, projectId, job, (prompt) => generateDirect(prompt, config, key));
}
