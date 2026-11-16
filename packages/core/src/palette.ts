import type { Task } from './types';

export type PalettePage = { tab: string; section: string; label: string; ship?: string };

export type PaletteCommand =
  | { kind: 'go'; tab: string; label: string; group: 'Go'; ship?: string }
  | { kind: 'create-task'; title: string; label: string; group: 'Create' }
  | { kind: 'status'; status: Task['status']; label: string; group: 'Status' }
  | { kind: 'open-doc'; docId: string; label: string; group: 'Open' };

function statusLabel(status: Task['status']): string {
  switch (status) {
    case 'todo':
      return 'To do';
    case 'doing':
      return 'Doing';
    case 'done':
      return 'Done';
    default: {
      const unexpected: never = status;
      return unexpected;
    }
  }
}

function includes(label: string, query: string): boolean {
  return label.toLowerCase().includes(query);
}

/** Commands for the project field. An empty query lists each page, the selected task's other statuses, and its linked docs. A phrase that matches none of those becomes a create command. */
export function paletteCommands(input: {
  query: string;
  pages: PalettePage[];
  selected: { title: string; status: Task['status'] } | null;
  linkedDocs: Array<{ id: string; title: string }>;
}): PaletteCommand[] {
  const q = input.query.trim().toLowerCase();
  const go: PaletteCommand[] = [];
  for (const page of input.pages) {
    const matches = q.length === 0
      || includes(page.label, q)
      || (page.ship != null && includes(page.ship, q));
    if (!matches) continue;
    go.push({ kind: 'go', tab: page.tab, label: page.label, group: 'Go', ship: page.ship });
  }

  const about: PaletteCommand[] = [];
  if (input.selected) {
    const statuses = ['todo', 'doing', 'done'] as const;
    for (const status of statuses) {
      if (status === input.selected.status) continue;
      const name = statusLabel(status);
      const label = `Set "${input.selected.title}" to ${name}`;
      if (q.length === 0 || includes(label, q) || includes(name, q)) {
        about.push({ kind: 'status', status, label, group: 'Status' });
      }
    }
    for (const doc of input.linkedDocs) {
      const label = `Open ${doc.title}`;
      if (q.length === 0 || includes(label, q) || includes(doc.title, q)) {
        about.push({ kind: 'open-doc', docId: doc.id, label, group: 'Open' });
      }
    }
  }

  const commands = [...about, ...go];
  if (q.length === 0) return commands;
  const create: PaletteCommand = {
    kind: 'create-task',
    title: input.query.trim(),
    label: `Create task "${input.query.trim()}"`,
    group: 'Create',
  };
  if (commands.length === 0) return [create];
  return [...commands, create];
}
