import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from './schema';
import {
  DOCS_FTS_SQL,
  DOCS_LIKE_SQL,
  MEMORY_FTS_SQL,
  TASKS_FTS_SQL,
  destinationForSearchKind,
  searchHitElementId,
  toHits,
  toLikePattern,
  toMatchQuery,
} from './search';

interface HitRow {
  id: string;
  title: string;
  snippet: string;
}

function rows(db: DatabaseSync, sql: string, ...params: Array<string>): HitRow[] {
  return (db.prepare(sql).all(...params) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    title: String(r.title),
    snippet: String(r.snippet ?? ''),
  }));
}

function ftsSupported(): boolean {
  try {
    const probe = new DatabaseSync(':memory:');
    probe.exec('CREATE VIRTUAL TABLE probe USING fts5(x)');
    probe.close();
    return true;
  } catch {
    return false;
  }
}

function openMigrated(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  for (const sql of MIGRATIONS) db.exec(sql);
  db.exec(`INSERT INTO docs (id, project_id, title, body, created_at, updated_at) VALUES
    ('d1', 'p1', 'Quarterly report', 'Revenue grew across regions.', 1, 1),
    ('d2', 'p2', 'Other project', 'Revenue figures here too.', 2, 2),
    ('d3', 'p1', '100% coverage', 'Testing notes.', 3, 3)`);
  db.exec(`INSERT INTO memory_entries (id, project_id, kind, content, created_at) VALUES
    ('m1', 'p1', 'note', 'Discussed quarterly goals.', 4)`);
  db.exec(`INSERT INTO tasks (id, project_id, title, status, created_at, updated_at) VALUES
    ('t1', 'p1', 'Write quarterly summary', 'todo', 5, 5)`);
  return db;
}

describe('search hit destinations', () => {
  it('maps each searchable kind onto the tab that owns it', () => {
    expect(destinationForSearchKind('doc')).toBe('library');
    expect(destinationForSearchKind('memory')).toBe('activity');
    expect(destinationForSearchKind('task')).toBe('tasks');
    expect(searchHitElementId({ kind: 'task', id: 't1' })).toBe('entity-task-t1');
  });
});

describe.runIf(ftsSupported())('FTS search SQL (real migrations)', () => {
  it('finds docs, memory and tasks scoped to the project', () => {
    const db = openMigrated();
    const match = toMatchQuery('quarterly');
    const docs = toHits('doc', rows(db, DOCS_FTS_SQL, match, 'p1'));
    expect(docs.map((h) => h.id)).toEqual(['d1']);
    expect(docs[0].snippet.length).toBeGreaterThan(0);
    const mem = toHits('memory', rows(db, MEMORY_FTS_SQL, match, 'p1'));
    expect(mem.map((h) => h.id)).toEqual(['m1']);
    const tasks = toHits('task', rows(db, TASKS_FTS_SQL, match, 'p1'));
    expect(tasks.map((h) => h.id)).toEqual(['t1']);
    // Other projects are excluded even when their text matches.
    expect(db.prepare(DOCS_FTS_SQL).all(toMatchQuery('figures'), 'p1')).toHaveLength(0);
    db.close();
  });

  it('keeps the index fresh on update and delete', () => {
    const db = openMigrated();
    db.exec(`UPDATE docs SET body = 'nothing relevant' WHERE id = 'd1'`);
    expect(db.prepare(DOCS_FTS_SQL).all(toMatchQuery('revenue'), 'p1')).toHaveLength(0);
    db.exec(`DELETE FROM memory_entries WHERE id = 'm1'`);
    expect(db.prepare(MEMORY_FTS_SQL).all(toMatchQuery('goals'), 'p1')).toHaveLength(0);
    db.exec(`UPDATE tasks SET title = 'renamed' WHERE id = 't1'`);
    expect(db.prepare(TASKS_FTS_SQL).all(toMatchQuery('quarterly'), 'p1')).toHaveLength(0);
    db.close();
  });

  it('sanitizes MATCH metacharacters instead of throwing', () => {
    expect(toMatchQuery('a*b "c')).toBe('"a*b" """c"');
    const db = openMigrated();
    expect(() => db.prepare(DOCS_FTS_SQL).all(toMatchQuery('quarterly) OR (1=1'), 'p1')).not.toThrow();
    db.close();
  });

  it('LIKE fallback SQL runs with proper escaping', () => {
    const db = openMigrated();
    // A bare % matches only literal percent signs when escaped.
    const pct = rows(db, DOCS_LIKE_SQL, 'p1', toLikePattern('%'), toLikePattern('%'));
    expect(pct.map((r) => r.id)).toEqual(['d3']);
    const rev = rows(db, DOCS_LIKE_SQL, 'p1', toLikePattern('Revenue'), toLikePattern('Revenue'));
    expect(rev.map((r) => r.id)).toEqual(['d1']);
    db.close();
  });
});
