// Local vector search spike. FTS5 stays the lexical path. When sqlite-vec
// (MIT OR Apache-2.0) is loaded in an opener, its candidates blend here.
// This module stays dependency-free so CI can prove ranking without natives.

import type { SearchHit, SearchKind } from './search';

export interface VectorCandidate {
  kind: SearchKind;
  id: string;
  title: string;
  snippet?: string;
  /** Higher is closer. Cosine similarity or distance inverted by the opener. */
  score: number;
}

function hitKey(kind: SearchKind, id: string): string {
  return `${kind}:${id}`;
}

/** Reciprocal rank fusion of FTS hits and vector candidates. */
export function blendSearchRanks(
  ftsHits: SearchHit[],
  vectorHits: VectorCandidate[],
  limit = 20,
  k = 60,
): SearchHit[] {
  const scores = new Map<string, { hit: SearchHit; score: number }>();

  ftsHits.forEach((hit, index) => {
    const key = hitKey(hit.kind, hit.id);
    const prior = scores.get(key);
    const add = 1 / (k + index + 1);
    scores.set(key, {
      hit: prior?.hit ?? hit,
      score: (prior?.score ?? 0) + add,
    });
  });

  const vectors = [...vectorHits].sort((a, b) => b.score - a.score);
  vectors.forEach((candidate, index) => {
    const key = hitKey(candidate.kind, candidate.id);
    const prior = scores.get(key);
    const add = 1 / (k + index + 1);
    const hit: SearchHit = prior?.hit ?? {
      kind: candidate.kind,
      id: candidate.id,
      title: candidate.title,
      snippet: candidate.snippet ?? '',
    };
    scores.set(key, {
      hit,
      score: (prior?.score ?? 0) + add,
    });
  });

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.hit);
}
