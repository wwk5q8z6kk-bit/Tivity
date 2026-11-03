import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { Store } from '@tivity/core';
import { openIdeStore } from './db';
import {
  createTaskOp,
  impactOp,
  listProjectsOp,
  recordMemoryOp,
  searchOp,
  setTaskStatusOp,
  tasksOp,
} from './ops';

// MCP stdio server: exposes Tivity to IDE agents (Copilot, Cursor, Claude
// Code) over stdin/stdout. Tool handlers are thin wrappers over ops.ts —
// all domain logic and validation lives there and is tested without the
// SDK. Node-only (like agent-runtime's ./llm): NOT re-exported from index.

const PROJECT_ARG = 'Project id or name. Defaults to the server default, then the first project.';

function text(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

function failure(err: unknown) {
  return {
    content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }],
    isError: true,
  };
}

export function createTivityServer(store: Store, defaultProject?: string): McpServer {
  const server = new McpServer({ name: 'tivity', version: '0.1.0' });
  const proj = (p?: string): string | undefined => {
    const v = (p ?? '').trim() || (defaultProject ?? '').trim();
    return v || undefined;
  };

  server.registerTool('tivity_projects', { description: 'List Tivity projects.' }, async () => {
    try {
      return text(await listProjectsOp(store));
    } catch (err) {
      return failure(err);
    }
  });

  server.registerTool(
    'tivity_search',
    {
      description: 'Full-text search over docs, memory entries, and tasks.',
      inputSchema: { project: z.string().optional().describe(PROJECT_ARG), query: z.string().describe('Search terms.') },
    },
    async ({ project, query }) => {
      try {
        return text(await searchOp(store, proj(project), query));
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'tivity_tasks',
    {
      description: 'List tasks, optionally filtered by status.',
      inputSchema: {
        project: z.string().optional().describe(PROJECT_ARG),
        status: z.string().optional().describe('todo, doing, or done. Empty lists all.'),
      },
    },
    async ({ project, status }) => {
      try {
        return text(await tasksOp(store, proj(project), status));
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'tivity_create_task',
    {
      description: 'Create a task in a project.',
      inputSchema: { project: z.string().optional().describe(PROJECT_ARG), title: z.string().describe('Task title.') },
    },
    async ({ project, title }) => {
      try {
        return text(await createTaskOp(store, proj(project), title));
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'tivity_set_task_status',
    {
      description: 'Move a task to todo, doing, or done. Task is an id or exact title.',
      inputSchema: {
        project: z.string().optional().describe(PROJECT_ARG),
        task: z.string().describe('Task id or exact title.'),
        status: z.string().describe('todo, doing, or done.'),
      },
    },
    async ({ project, task, status }) => {
      try {
        return text(await setTaskStatusOp(store, proj(project), task, status));
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'tivity_record_memory',
    {
      description: 'Append a memory entry (decision context, learnings, notes).',
      inputSchema: {
        project: z.string().optional().describe(PROJECT_ARG),
        kind: z.string().optional().describe('Entry kind, e.g. note, decision, learning. Default: note.'),
        content: z.string().describe('Memory content.'),
      },
    },
    async ({ project, kind, content }) => {
      try {
        return text(await recordMemoryOp(store, proj(project), kind ?? '', content));
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'tivity_impact',
    {
      description: 'Show the requirement-change impact queue awaiting review.',
      inputSchema: {
        project: z.string().optional().describe(PROJECT_ARG),
        includeResolved: z.boolean().optional().describe('Include accepted/dismissed items. Default: false.'),
      },
    },
    async ({ project, includeResolved }) => {
      try {
        return text(await impactOp(store, proj(project), includeResolved ?? false));
      } catch (err) {
        return failure(err);
      }
    },
  );

  return server;
}

// stdio main: stdout is the protocol channel — only errors go to stderr.
export async function runStdio(): Promise<void> {
  const { store } = await openIdeStore();
  const fallback = (process.env.TIVITY_PROJECT ?? '').trim() || undefined;
  const server = createTivityServer(store, fallback);
  await server.connect(new StdioServerTransport());
}
