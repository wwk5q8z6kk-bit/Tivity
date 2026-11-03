import { describe, expect, it } from 'vitest';
import type { Link } from './types';
import { findImpacted } from './links';

function link(fromKind: Link['fromKind'], fromId: string, toKind: Link['toKind'], toId: string): Link {
  return {
    id: `${fromId}-${toId}`, projectId: 'p1', fromKind, fromId,
    toKind, toId, relation: 'relates', createdAt: 1,
  };
}

describe('findImpacted', () => {
  it('walks transitive links across systems', () => {
    const links = [
      link('decision', 'd1', 'task', 't1'),
      link('task', 't1', 'doc', 'doc1'),
      link('doc', 'doc1', 'memory', 'm1'),
    ];
    const out = findImpacted(links, { kind: 'decision', id: 'd1' });
    expect(out).toEqual([
      { kind: 'task', id: 't1' },
      { kind: 'doc', id: 'doc1' },
      { kind: 'memory', id: 'm1' },
    ]);
  });

  it('ignores unrelated links and reverse direction', () => {
    const links = [
      link('task', 't9', 'doc', 'doc9'),
      link('doc', 'doc1', 'task', 't1'),
    ];
    expect(findImpacted(links, { kind: 'task', id: 't1' })).toEqual([]);
  });

  it('respects maxDepth and survives cycles', () => {
    const links = [
      link('task', 't1', 'task', 't2'),
      link('task', 't2', 'task', 't1'),
      link('task', 't2', 'task', 't3'),
    ];
    expect(findImpacted(links, { kind: 'task', id: 't1' }, 1)).toEqual([
      { kind: 'task', id: 't2' },
    ]);
    expect(findImpacted(links, { kind: 'task', id: 't1' }, 5)).toEqual([
      { kind: 'task', id: 't2' },
      { kind: 'task', id: 't3' },
    ]);
  });
});
