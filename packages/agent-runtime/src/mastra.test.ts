import { describe, expect, it } from 'vitest';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { BrowserStore } from '@tivity/core';

// Standing proof for decision 0017 (kept from the M4a spike): Mastra tools wrap
// the Tivity Store and run under Vitest with no network and no model keys.
// Agent-loop-with-model stays for M4b; this covers the tool seam.

describe('mastra spike', () => {
  it('wraps the Tivity store in a Mastra tool', async () => {
    const store = new BrowserStore();
    const p = await store.createProject({ name: 'SP' });
    await store.createTask(p.id, 'T1');
    const listTasks = createTool({
      id: 'list-tasks',
      description: 'List open tasks for a project',
      inputSchema: z.object({ projectId: z.string() }),
      outputSchema: z.object({ count: z.number() }),
      execute: async (inputData) => {
        const tasks = await store.listTasks(inputData.projectId);
        return { count: tasks.length };
      },
    });
    const out = await listTasks.execute?.({ projectId: p.id }, {});
    expect(out).toEqual({ count: 1 });
  });
});
