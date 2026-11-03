import { invoke } from '@tauri-apps/api/core';
import { executeAgentTask, generateDirect, modelApiKey, resolveModelConfig } from '@tivity/agent-runtime';
import type { Job, Store } from '@tivity/core';

// Desktop `agent-task` override: tries the Tauri-native LLM call first (no
// webview CORS), falls back to direct fetch for plain browser dev, where the
// localhost origin is CORS-allowed by Ollama (decision 0019).

export async function desktopAgentTask(store: Store, projectId: string, job: Job): Promise<{ summary: string }> {
  const config = resolveModelConfig();
  if (!config.hasKey) {
    throw new Error(`${config.provider} provider needs TIVITY_MODEL_API_KEY (or OPENAI_API_KEY) — nothing was called.`);
  }
  const key = modelApiKey(config);
  return executeAgentTask(store, projectId, job, async (prompt) => {
    try {
      return await invoke<string>('llm_chat', {
        req: { base_url: config.baseURL, api_key: key ?? null, model: config.model, prompt },
      });
    } catch {
      return generateDirect(prompt, config, key);
    }
  });
}
