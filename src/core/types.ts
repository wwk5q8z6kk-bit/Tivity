// Core domain model for Tivity: every system connects through links,
// so a change in one place can propagate to architecture, backlog,
// tasks, tests and docs.

export type EntityKind =
  | 'project'
  | 'requirement'
  | 'doc'
  | 'task'
  | 'decision'
  | 'memory';

export interface Project {
  id: string;
  name: string;
  summary: string;
  status: string;
  createdAt: number;
  updatedAt: number;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  status: 'todo' | 'doing' | 'done';
  createdAt: number;
  updatedAt: number;
}

export interface Doc {
  id: string;
  projectId: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

export interface Decision {
  id: string;
  projectId: string;
  title: string;
  context: string;
  verdict: string;
  createdAt: number;
}

export interface MemoryEntry {
  id: string;
  projectId: string;
  kind: string;
  content: string;
  createdAt: number;
}

export interface Link {
  id: string;
  projectId: string;
  fromKind: EntityKind;
  fromId: string;
  toKind: EntityKind;
  toId: string;
  relation: string;
  createdAt: number;
}
