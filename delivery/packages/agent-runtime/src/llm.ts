import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { Store } from '@tivity/core';
import { readTaskContextImpl } from './llm-core';

// Node-only Mastra seam (tests + future worker): @mastra/core imports Node
// builtins and cannot bundle into the frontend. Never import this module
// from frontend-reachable code — the client path uses llm-core + llm-handler.

export type Model = ConstructorParameters<typeof Agent>[0]['model'];

export function buildAgentTools(store: Store, projectId: string) {
  const listOpenTasks = createTool({
    id: 'list-open-tasks',
    description: 'List tasks that are not done yet.',
    inputSchema: z.object({}),
    outputSchema: z.object({
      tasks: z.array(z.object({ id: z.string(), title: z.string(), status: z.string() })),
    }),
    execute: async () => {
      const tasks = (await store.listTasks(projectId)).filter((t) => t.status !== 'done');
      return { tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status })) };
    },
  });

  const readTaskContext = createTool({
    id: 'read-task-context',
    description: 'Read a task plus the titles of everything linked to it.',
    inputSchema: z.object({ taskId: z.string() }),
    outputSchema: z.object({
      title: z.string(),
      status: z.string(),
      linked: z.array(z.object({ kind: z.string(), title: z.string(), relation: z.string() })),
    }),
    execute: async (inputData) => readTaskContextImpl(store, projectId, inputData.taskId),
  });

  const recordNote = createTool({
    id: 'record-note',
    description: 'Save a note to project memory.',
    inputSchema: z.object({ content: z.string(), kind: z.string().optional() }),
    outputSchema: z.object({ id: z.string() }),
    execute: async (inputData) => {
      const entry = await store.appendMemory(projectId, inputData.kind ?? 'agent', inputData.content);
      return { id: entry.id };
    },
  });

  return { listOpenTasks, readTaskContext, recordNote };
}

export function buildAgent(model: Model, tools: ReturnType<typeof buildAgentTools>): Agent {
  return new Agent({
    id: 'tivity',
    name: 'Tivity',
    instructions:
      'You are a project-grounded assistant. Use the available tools to read project state before answering. ' +
      'Never claim you changed anything — summarize findings so the caller can record them.',
    model,
    tools,
  });
}
