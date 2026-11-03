import type { EntityKind, Link } from './types';

export interface EntityRef {
  kind: EntityKind;
  id: string;
}

// Breadth-first walk over links in from→to direction: answers "if this
// changes, what does it touch?" across every connected system.
export function findImpacted(links: Link[], from: EntityRef, maxDepth = 5): EntityRef[] {
  const key = (r: EntityRef): string => `${r.kind}:${r.id}`;
  const seen = new Set<string>([key(from)]);
  const out: EntityRef[] = [];
  let frontier: Array<{ ref: EntityRef; depth: number }> = [{ ref: from, depth: 0 }];
  while (frontier.length > 0) {
    const next: Array<{ ref: EntityRef; depth: number }> = [];
    for (const { ref, depth } of frontier) {
      if (depth >= maxDepth) continue;
      for (const l of links) {
        if (l.fromKind === ref.kind && l.fromId === ref.id) {
          const target: EntityRef = { kind: l.toKind, id: l.toId };
          const k = key(target);
          if (!seen.has(k)) {
            seen.add(k);
            out.push(target);
            next.push({ ref: target, depth: depth + 1 });
          }
        }
      }
    }
    frontier = next;
  }
  return out;
}

export function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}
