// Shared FTS query builders: used by TauriStore at runtime and by the
// node:sqlite tests, so the committed suite exercises the real SQL.

export type SearchKind = 'doc' | 'memory' | 'task';

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  snippet: string;
}

// "quarterly report" -> '"quarterly" "report"': AND of phrases, immune to
// MATCH metacharacters (quotes inside a term are doubled per FTS5 rules).
export function toMatchQuery(input: string): string {
  const terms = input.split(/\s+/).map((t) => t.trim()).filter(Boolean);
  return terms.map((t) => `"${t.replace(/"/g, '""')}"`).join(' ');
}

export function isSearchable(input: string): boolean {
  return input.trim().length > 0;
}

// LIKE fallback: escapes wildcards, wraps in %…% for substring matching.
export function toLikePattern(input: string): string {
  return `%${input.trim().replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
}

export const DOCS_LIKE_SQL = `
  SELECT id, title, substr(body, 1, 120) AS snippet FROM docs
  WHERE project_id = ? AND (title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')
  ORDER BY created_at DESC LIMIT 20`;

export const MEMORY_LIKE_SQL = `
  SELECT id, (kind || ': ' || substr(content, 1, 60)) AS title, substr(content, 1, 120) AS snippet
  FROM memory_entries
  WHERE project_id = ? AND (kind LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')
  ORDER BY created_at DESC LIMIT 20`;

export const TASKS_LIKE_SQL = `
  SELECT id, title, '' AS snippet FROM tasks
  WHERE project_id = ? AND title LIKE ? ESCAPE '\\'
  ORDER BY created_at DESC LIMIT 20`;

// One query per source: FTS match joined back for project scoping + ids,
// newest first. The snippet column is plain text (no markup).
export const DOCS_FTS_SQL = `
  SELECT d.id AS id, d.title AS title,
    snippet(docs_fts, 1, '', '', '…', 12) AS snippet
  FROM docs_fts JOIN docs d ON d.rowid = docs_fts.rowid
  WHERE docs_fts MATCH ? AND d.project_id = ?
  ORDER BY rank LIMIT 20`;

export const MEMORY_FTS_SQL = `
  SELECT m.id AS id, (m.kind || ': ' || substr(m.content, 1, 60)) AS title,
    snippet(memory_fts, 1, '', '', '…', 12) AS snippet
  FROM memory_fts JOIN memory_entries m ON m.rowid = memory_fts.rowid
  WHERE memory_fts MATCH ? AND m.project_id = ?
  ORDER BY rank LIMIT 20`;

export const TASKS_FTS_SQL = `
  SELECT t.id AS id, t.title AS title,
    snippet(tasks_fts, 0, '', '', '…', 12) AS snippet
  FROM tasks_fts JOIN tasks t ON t.rowid = tasks_fts.rowid
  WHERE tasks_fts MATCH ? AND t.project_id = ?
  ORDER BY rank LIMIT 20`;

interface FtsRow {
  id: string;
  title: string;
  snippet: string;
}

export function toHits(kind: SearchKind, rows: FtsRow[]): SearchHit[] {
  return rows.map((r) => ({ kind, id: r.id, title: r.title, snippet: r.snippet ?? '' }));
}
