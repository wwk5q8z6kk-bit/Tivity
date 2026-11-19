import type { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { TauriStore, ensureSeeded, type SqlDb, type Store } from '@tivity/core';

// Node-side store opener: opens the desktop app's tivity.db file directly,
// so the IDE surfaces read and write the same rows. node:sqlite is a
// builtin (no native builds); when it is missing the error says so plainly.

export const APP_ID = 'com.tivity.app';
export const DB_FILE = 'tivity.db';

export class NodeSqliteDb implements SqlDb {
  constructor(private db: DatabaseSync) {}

  async execute(query: string, params: unknown[] = []): Promise<unknown> {
    this.db.prepare(query).run(...(params as Array<string | number | bigint | null>));
    return undefined;
  }

  async select<T>(query: string, params: unknown[] = []): Promise<T> {
    return this.db.prepare(query).all(...(params as Array<string | number | bigint | null>)) as T;
  }

  close(): void {
    this.db.close();
  }
}

export function defaultDbPath(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', APP_ID, DB_FILE);
  }
  if (platform === 'win32') {
    const base = env.APPDATA || join(home, 'AppData', 'Roaming');
    return join(base, APP_ID, DB_FILE);
  }
  const base = env.XDG_DATA_HOME || join(home, '.local', 'share');
  return join(base, APP_ID, DB_FILE);
}

export function resolveDbPath(explicit?: string, env: NodeJS.ProcessEnv = process.env): string {
  if ((explicit ?? '').trim()) return explicit!.trim();
  if ((env.TIVITY_DB_PATH ?? '').trim()) return env.TIVITY_DB_PATH!.trim();
  return defaultDbPath();
}

async function loadDatabaseSync(): Promise<typeof DatabaseSync> {
  try {
    return (await import('node:sqlite')).DatabaseSync;
  } catch {
    throw new Error(
      'Tivity needs node:sqlite (Node 22.5+), which this host does not provide. ' +
        'Upgrade Node or VS Code (Electron 35+), or run the MCP server with a newer Node.',
    );
  }
}

export interface OpenedStore {
  store: Store;
  dbPath: string;
  close: () => void;
}

// Opens (creating parent dirs), migrates idempotently, and seeds only when
// empty — the same contract as the desktop, so whichever surface runs
// first owns the seed and later ones just attach.
export async function openIdeStore(dbPath?: string): Promise<OpenedStore> {
  const DatabaseSyncCtor = await loadDatabaseSync();
  const resolved = resolveDbPath(dbPath);
  mkdirSync(dirname(resolved), { recursive: true });
  const raw = new DatabaseSyncCtor(resolved);
  const db = new NodeSqliteDb(raw);
  const store = new TauriStore(db);
  await store.migrate();
  await ensureSeeded(store);
  return { store, dbPath: resolved, close: () => db.close() };
}
