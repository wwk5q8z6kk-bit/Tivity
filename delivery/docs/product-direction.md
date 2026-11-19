# Tivity unified workspace

Tivity is intended to replace the daily work split across Linear, Jira and Confluence, and Buzz by Block. Planning, knowledge, delivery, conversation, and agent execution belong in one product with shared records. An external integration may help teams migrate, but using a separate collaboration app must not be required for Tivity's core workflow.

This is the product target, not a claim of current parity. The current app is a local-first foundation. Team identity, permission enforcement, remote synchronization, and real-time collaboration remain essential work before a team can depend on it as its shared workspace.

## One connected workflow

A discussion becomes a task without losing its source conversation. The task connects to requirements, decisions, docs, code, tests, and a release. People and agents can read that context and contribute through the same operations. A decision or requirement change produces a reviewable impact queue. Completion carries its evidence back to the original discussion and project history.

The first implemented connection is a persistent discussion on a task. It is available in the task inspector and through MCP. It shares the task's project scope and survives reopening the store. It is an append-only local thread with display attribution; it does not yet provide authenticated participants or real-time remote messaging.

## Replacement capabilities

| Product area | Existing foundation | Required for replacement |
| --- | --- | --- |
| Linear-style daily work | Tasks, list/board, keyboard commands, projects, sprints, milestones | Issue identifiers, descriptions, owners, priorities, labels, due dates, subtasks, dependencies, triage, saved views, inbox, bulk changes |
| Jira-style planning and delivery | Requirements, sprints, PR/release records, GitHub issue sync, quality registries | Configurable workflows, backlog ordering, cycle capacity, dependency scheduling, portfolio views, reports, automation and import/export |
| Confluence-style knowledge | Docs, decisions, evidence, versioned requirements, links, local search | Editing/version history, page hierarchy, attachments, templates, comments, permissions, references and portable exports |
| Buzz-style collaboration | Task discussion in the app and MCP, agent jobs/runs, persistent memory | Project rooms, threads, mentions, notifications, membership, authenticated human/agent identities, shared synchronization, presence, attachments, approvals |
| Agent work | Audited job/run ledger, local model path, MCP operations | Scoped identities, explicit capabilities, reviewable plans and writes, cancellation, recoverable runs, evidence and approval records |
| Shared workspace | Local SQLite and browser stores, common domain model | Teams, membership, authorization, synchronization protocol, conflict handling, backup/restore, access-aware search and activity |

The area names describe the intended workflows. They do not promise replacement of every Atlassian product. Sources for comparison: [Linear features](https://linear.app/features), [Jira features](https://www.atlassian.com/software/jira/features), [Confluence features](https://www.atlassian.com/software/confluence/features), and [Block Buzz](https://github.com/block/buzz).

## Architecture constraints

- Keep one domain model and stable record identifiers. A conversation linked to an issue must not become an unrelated copy in another subsystem.
- Keep local SQLite useful offline. Design shared synchronization and server authorization explicitly; opening the same local file is not a multi-user collaboration protocol.
- Expose the same domain operations to the UI and agents. Enforce project scope in storage operations; authenticated authorization is a separate required layer.
- Preserve source links, authorship, timestamps, run evidence, and approval history through imports and conversions.
- Keep collaboration native. Buzz may remain an optional bridge during migration; its relay protocol is an evaluated option for future synchronization, not a requirement already chosen.
- Deliver connected, usable capabilities across the product. Avoid building three separate applications under one navigation bar.

## Implementation order

1. **Work and discussion together:** persistent task discussions in browser and SQLite, UI and MCP access, project isolation, validation and persistence tests. Implemented in this change.
2. **Usable issue management:** richer issues, assignment, prioritization, labels, dependencies, saved views, editable docs, and conversation-to-task conversion retaining the source link.
3. **Shared team foundation:** workspace identity, human/agent membership, roles, server authorization, synchronization, conflict recovery and backups. This is the gate for claiming shared team readiness.
4. **Project conversations and inbox:** rooms, threaded replies, mentions, notifications and agent handoffs on the shared foundation. Local prototypes must remain labeled local.
5. **Connected delivery and governance:** configurable workflows, planning/reporting, code and CI evidence, approvals, releases and recoverable automation.
6. **Migration and replacement proof:** import from existing tools with source identifiers, export/restore, permission tests, representative team workflows and a documented parity matrix.

The existing [open source roadmap](open-source-roadmap.md) supplies candidate libraries for this product direction. Dependency adoption serves these workflows; the project goal is the integrated workspace.
