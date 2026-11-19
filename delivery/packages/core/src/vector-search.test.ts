import { describe, expect, it } from 'vitest';
import { blendSearchRanks } from './vector-search';
import type { SearchHit } from './search';

describe('blendSearchRanks', () => {
  it('keeps an FTS-only list in order when there are no vectors', () => {
    const fts: SearchHit[] = [
      { kind: 'task', id: 'a', title: 'Alpha', snippet: '' },
      { kind: 'task', id: 'b', title: 'Beta', snippet: '' },
    ];
    expect(blendSearchRanks(fts, []).map((h) => h.id)).toEqual(['a', 'b']);
  });

  it('surfaces a strong vector hit ahead of a weak FTS hit', () => {
    const fts: SearchHit[] = [
      { kind: 'doc', id: 'noise', title: 'Noise', snippet: 'unrelated' },
      { kind: 'doc', id: 'notes', title: 'Project notes', snippet: 'links' },
    ];
    const vectors = [
      { kind: 'doc' as const, id: 'notes', title: 'Project notes', score: 0.92 },
    ];
    expect(blendSearchRanks(fts, vectors)[0]?.id).toBe('notes');
  });

  it('includes a vector-only candidate that FTS missed', () => {
    const fts: SearchHit[] = [
      { kind: 'memory', id: 'm1', title: 'note: seed', snippet: 'seeded' },
    ];
    const vectors = [
      { kind: 'task' as const, id: 't9', title: 'Connect docs', score: 0.88, snippet: 'links' },
    ];
    const blended = blendSearchRanks(fts, vectors);
    expect(blended.some((h) => h.id === 't9' && h.kind === 'task')).toBe(true);
    expect(blended.some((h) => h.id === 'm1')).toBe(true);
  });
});
