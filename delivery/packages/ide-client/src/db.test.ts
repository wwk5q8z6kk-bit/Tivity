import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultDbPath, openIdeStore, resolveDbPath } from './db';

describe('db path resolution', () => {
  it('prefers explicit, then env, then platform default', () => {
    expect(resolveDbPath('/x.db', {})).toBe('/x.db');
    expect(resolveDbPath('', { TIVITY_DB_PATH: '/e.db' })).toBe('/e.db');
    expect(resolveDbPath('  ', { TIVITY_DB_PATH: '  /e.db ' })).toBe('/e.db');
    expect(resolveDbPath(undefined, {})).toBe(defaultDbPath());
  });

  it('maps platforms to the desktop app-data dir', () => {
    expect(defaultDbPath('darwin', {}, '/h')).toBe(
      '/h/Library/Application Support/com.tivity.app/tivity.db',
    );
    expect(defaultDbPath('linux', {}, '/h')).toBe('/h/.local/share/com.tivity.app/tivity.db');
    expect(defaultDbPath('linux', { XDG_DATA_HOME: '/x' }, '/h')).toBe('/x/com.tivity.app/tivity.db');
    expect(defaultDbPath('win32', { APPDATA: 'C:\\A' }, '/h')).toBe('C:\\A/com.tivity.app/tivity.db');
  });
});

describe('openIdeStore (real node:sqlite)', () => {
  function tempDb(): string {
    return join(mkdtempSync(join(tmpdir(), 'tivity-ide-')), 'tivity.db');
  }

  it('migrates, seeds once, and round-trips tasks + search', async () => {
    const path = tempDb();
    const first = await openIdeStore(path);
    expect(first.dbPath).toBe(path);
    const projects = await first.store.listProjects();
    expect(projects.length).toBe(1);
    const task = await first.store.createTask(projects[0].id, 'Wire IDE search probe');
    const comment = await first.store.addTaskComment(projects[0].id, task.id, {
      author: 'IDE agent', body: 'The native store keeps this discussion.',
    });
    const doc = await first.store.createDoc(projects[0].id, 'IDE notes', 'The quickstart probe body.');
    const hits = await first.store.search(projects[0].id, 'probe');
    expect(hits.map((h) => h.id)).toContain(task.id);
    expect(hits.map((h) => h.id)).toContain(doc.id);
    first.close();

    // Reopen: same file, no double seed, data intact.
    const second = await openIdeStore(path);
    expect((await second.store.listProjects()).length).toBe(1);
    expect((await second.store.listTasks(projects[0].id)).map((t) => t.title))
      .toContain('Wire IDE search probe');
    expect(await second.store.listTaskComments(projects[0].id, task.id)).toEqual([comment]);
    second.close();
  });

  it('creates missing parent directories', async () => {
    const path = join(tempDb(), 'deep', 'nested', 'tivity.db');
    const opened = await openIdeStore(path);
    expect((await opened.store.listProjects()).length).toBe(1);
    opened.close();
  });
});
