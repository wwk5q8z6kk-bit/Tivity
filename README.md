# Tivity — AI-native Project Operating System

One workspace. One source of truth. Every project. Every stage. Every agent.

Status: M0–M3 + M2b shipped and verified (monorepo + GitHub pull sync). Build target is a launchable app —
task owner chose "whatever is best, most efficient, robust, and AI-native."

Decisions so far:
- Scope: full platform (phased delivery)
- Stack: TypeScript + SQLite core in this folder
- Interface: launchable app; final surface (desktop local-first vs web)
  to be fixed by research synthesis, biased to one-command launch.

Vision systems (all connected):
requirements, research, architecture/decisions, design/screens,
plans/backlog/GitHub, tasks/milestones/sprints/PRs/releases,
agents, docs/files/conversations/services, quality/security/testing,
persistent memory.

## Run (v0 shell)

Prereqs: Node 24+, pnpm, Rust (cargo).

```sh
cd /Users/x/Projects/GitHub/Tivity
pnpm install
pnpm tauri:dev    # launchable desktop app (SQLite storage)
pnpm dev          # ...or plain browser dev (localStorage fallback)
pnpm test         # unit tests (link propagation)
pnpm typecheck && pnpm build
```

Decisions with scored options: [docs/decisions/README.md](docs/decisions/README.md).

## Layout (pnpm monorepo)

- `apps/desktop` — React UI + Tauri shell + store wiring (`pnpm dev`, `pnpm tauri:dev`)
- `packages/core` — domain model, SQLite schema, links, store backends (dependency-free)
- `packages/github-sync` — Octokit issue pull into linked tasks (pull-only v0)

Root commands fan out: `pnpm typecheck` (all packages), `pnpm test` (core + sync suites).

## GitHub sync (pull-only v0)

Open the Sync tab, enter owner/repo plus a fine-grained PAT with issues:read,
and pull. Issues become tasks linked to `owner/repo#number` refs; re-pulls skip
already-linked issues and record a cursor. Push sync arrives with the App-auth
decision (0007/M2c). The token is held in memory only and never stored.
App icons are generated placeholders — replace before any public release.
