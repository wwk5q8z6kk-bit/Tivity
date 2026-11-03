import { BrowserStore, TauriStore, ensureSeeded, type SqlDb, type Store } from '@tivity/core';

// App-side wiring: real SQLite inside Tauri, localStorage fallback in a
// plain browser. The plugin import lives here (not in core) so core stays
// dependency-free and reusable by future CLI/worker packages.

export type Backend = 'tauri-sql' | 'browser';

export async function createStore(): Promise<{ store: Store; backend: Backend }> {
  try {
    const mod = await import('@tauri-apps/plugin-sql');
    const db = (await mod.default.load('sqlite:tivity.db')) as unknown as SqlDb;
    const store = new TauriStore(db);
    await store.migrate();
    await ensureSeeded(store);
    return { store, backend: 'tauri-sql' };
  } catch {
    const store = new BrowserStore();
    await ensureSeeded(store);
    return { store, backend: 'browser' };
  }
}
