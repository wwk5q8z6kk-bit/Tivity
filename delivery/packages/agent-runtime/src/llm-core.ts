import type { Store } from '@tivity/core';

// Browser- AND Node-safe LLM plumbing: model config, direct OpenAI-compatible
// calls, task-context assembly. No Mastra imports here — Mastra is Node-only
// (stream/https/net) and would break the frontend bundle (decision 0019).
// Mastra Agent/tools live in ./llm (Node/tests/worker only).

export interface ModelConfig {
  provider: string;
  model: string;
  baseURL: string;
  hasKey: boolean;
}

type Env = Record<string, string | undefined>;

function ambientEnv(): Env {
  if (typeof process !== 'undefined' && process.env) return process.env as Env;
  return {};
}

// Ollama-local by default (no keys, free, private); any OpenAI-compatible
// endpoint via env. In the desktop UI the ambient env is empty, so the
// documented Ollama defaults apply unless a settings UI overrides later.
export function resolveModelConfig(env: Env = ambientEnv()): ModelConfig {
  if ((env.TIVITY_MODEL_PROVIDER ?? 'ollama') === 'openai') {
    return {
      provider: 'openai',
      model: env.TIVITY_MODEL_NAME ?? 'gpt-4o-mini',
      baseURL: env.TIVITY_MODEL_BASE_URL ?? 'https://api.openai.com/v1',
      hasKey: Boolean(env.TIVITY_MODEL_API_KEY ?? env.OPENAI_API_KEY),
    };
  }
  return {
    provider: 'ollama',
    model: env.TIVITY_MODEL_NAME ?? 'qwen2.5-coder:7b',
    baseURL: env.TIVITY_MODEL_BASE_URL ?? 'http://localhost:11434/v1',
    hasKey: true,
  };
}

export function modelApiKey(config: ModelConfig, env: Env = ambientEnv()): string | undefined {
  if (config.provider !== 'openai') return undefined;
  return env.TIVITY_MODEL_API_KEY ?? env.OPENAI_API_KEY;
}

export async function generateDirect(prompt: string, config: ModelConfig, apiKey?: string): Promise<string> {
  const res = await fetch(`${config.baseURL.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content: prompt }], stream: false }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`model call failed: ${res.status} ${body}`.slice(0, 200));
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('model returned empty text');
  return text;
}

export async function readTaskContextImpl(store: Store, projectId: string, taskId: string): Promise<{
  title: string;
  status: string;
  linked: Array<{ kind: string; title: string; relation: string }>;
}> {
  const [tasks, links, docs, decisions, requirements, evidence] = await Promise.all([
    store.listTasks(projectId),
    store.listLinks(projectId),
    store.listDocs(projectId),
    store.listDecisions(projectId),
    store.listRequirements(projectId),
    store.listEvidence(projectId),
  ]);
  const task = tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`task not found: ${taskId}`);
  const titleOf = (kind: string, id: string): string => {
    if (kind === 'task') return tasks.find((t) => t.id === id)?.title ?? id;
    if (kind === 'doc') return docs.find((d) => d.id === id)?.title ?? id;
    if (kind === 'decision') return decisions.find((d) => d.id === id)?.title ?? id;
    if (kind === 'requirement') return requirements.find((r) => r.id === id)?.title ?? id;
    if (kind === 'evidence') return evidence.find((e) => e.id === id)?.title ?? id;
    return `${kind}:${id.slice(0, 8)}`;
  };
  const linked = links
    .filter((l) => l.fromId === taskId || l.toId === taskId)
    .map((l) => {
      const other = l.fromId === taskId
        ? { kind: l.toKind, id: l.toId }
        : { kind: l.fromKind, id: l.fromId };
      return { kind: other.kind, title: titleOf(other.kind, other.id), relation: l.relation };
    });
  return { title: task.title, status: task.status, linked };
}
