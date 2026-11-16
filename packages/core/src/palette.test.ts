import { describe, expect, it } from 'vitest';
import { paletteCommands, type PalettePage } from './palette';

const pages: PalettePage[] = [
  { tab: 'requirements', section: 'Plan', label: 'Requirements' },
  { tab: 'tasks', section: 'Plan', label: 'Tasks' },
  { tab: 'docs', section: 'Record', label: 'Docs' },
  { tab: 'connectors', section: 'Connect', label: 'Connectors' },
];

describe('palette commands', () => {
  it('lists every page when the query is empty', () => {
    const commands = paletteCommands({ query: '', pages, selected: null, linkedDocs: [] });
    expect(commands.map((c) => c.label)).toEqual(['Requirements', 'Tasks', 'Docs', 'Connectors']);
  });

  it('keeps the ship stage on a go command', () => {
    const commands = paletteCommands({
      query: 'qual',
      pages: [{ tab: 'ship', section: 'Build', label: 'Quality', ship: 'quality' }],
      selected: null,
      linkedDocs: [],
    });
    expect(commands[0]).toMatchObject({ kind: 'go', tab: 'ship', label: 'Quality', ship: 'quality' });
    expect(commands[commands.length - 1]).toMatchObject({ kind: 'create-task' });
  });

  it('puts a status change and the linked doc ahead of create', () => {
    const commands = paletteCommands({
      query: 'Doing',
      pages,
      selected: { title: 'Connect your first docs and tasks with links', status: 'todo' },
      linkedDocs: [{ id: 'doc-1', title: 'Project notes' }],
    });
    expect(commands[0]).toMatchObject({ kind: 'status', status: 'doing' });
    expect(commands[commands.length - 1]).toMatchObject({ kind: 'create-task', title: 'Doing' });
  });

  it('opens a linked doc by its title and still offers create', () => {
    const commands = paletteCommands({
      query: 'notes',
      pages,
      selected: { title: 'Connect your first docs and tasks with links', status: 'doing' },
      linkedDocs: [{ id: 'doc-1', title: 'Project notes' }],
    });
    expect(commands[0]).toMatchObject({ kind: 'open-doc', docId: 'doc-1' });
    expect(commands.some((c) => c.kind === 'create-task')).toBe(true);
  });

  it('creates a task when the phrase matches nothing else', () => {
    const commands = paletteCommands({ query: 'Follow the opened hit', pages, selected: null, linkedDocs: [] });
    expect(commands).toEqual([
      { kind: 'create-task', title: 'Follow the opened hit', label: 'Create task "Follow the opened hit"', group: 'Create' },
    ]);
  });
});
