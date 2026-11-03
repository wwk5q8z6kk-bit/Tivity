// Core domain model for Tivity: every system connects through links,
// so a change in one place can propagate to architecture, backlog,
// tasks, tests and docs.

export type EntityKind =
  | 'project'
  | 'requirement'
  | 'doc'
  | 'task'
  | 'decision'
  | 'memory'
  | 'evidence'
  | 'sprint'
  | 'milestone'
  | 'pull_request'
  | 'release'
  | 'screen'
  | 'component'
  | 'test_case'
  | 'quality_gate'
  | 'security_finding'
  | 'monitor_check';

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

export interface Requirement {
  id: string;
  projectId: string;
  title: string;
  status: string;
  currentVersion: number;
  createdAt: number;
  updatedAt: number;
}

export interface RequirementVersion {
  id: string;
  requirementId: string;
  version: number;
  body: string;
  acceptance: string;
  createdAt: number;
}

export interface EvidenceItem {
  id: string;
  projectId: string;
  title: string;
  source: string;
  detail: string;
  createdAt: number;
}

export interface ImpactItem {
  id: string;
  projectId: string;
  triggerKind: EntityKind;
  triggerId: string;
  entityKind: EntityKind;
  entityId: string;
  reason: string;
  status: 'pending' | 'accepted' | 'dismissed';
  createdAt: number;
  resolvedAt: number | null;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  status: 'planned' | 'active' | 'closed';
  startsAt: number | null;
  endsAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  dueAt: number | null;
  status: string;
  createdAt: number;
  updatedAt: number;
}

export interface PullRequest {
  id: string;
  projectId: string;
  title: string;
  status: 'open' | 'merged' | 'closed';
  branch: string;
  createdAt: number;
  updatedAt: number;
}

export interface Release {
  id: string;
  projectId: string;
  name: string;
  notes: string;
  status: string;
  createdAt: number;
}

export interface ExternalRef {
  id: string;
  projectId: string;
  entityKind: EntityKind;
  entityId: string;
  service: string;
  externalId: string;
  createdAt: number;
}

export interface SyncState {
  key: string;
  projectId: string;
  cursor: string;
  updatedAt: number;
}

export interface Screen {
  id: string;
  projectId: string;
  name: string;
  route: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface DesignComponent {
  id: string;
  projectId: string;
  name: string;
  kind: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface TestCase {
  id: string;
  projectId: string;
  title: string;
  status: 'not-run' | 'pass' | 'fail';
  createdAt: number;
  updatedAt: number;
}

export interface TestRun {
  id: string;
  testCaseId: string;
  status: 'pass' | 'fail';
  note: string;
  createdAt: number;
}

export interface QualityGate {
  id: string;
  projectId: string;
  name: string;
  status: 'pending' | 'pass' | 'fail';
  createdAt: number;
  updatedAt: number;
}

export interface SecurityFinding {
  id: string;
  projectId: string;
  title: string;
  severity: string;
  status: 'open' | 'fixed' | 'dismissed';
  createdAt: number;
  updatedAt: number;
}

export interface MonitorCheck {
  id: string;
  projectId: string;
  name: string;
  status: 'unknown' | 'passing' | 'failing';
  detail: string;
  checkedAt: number | null;
  createdAt: number;
}
