# Tivity — AI-native Project Operating System

One workspace. One source of truth. Every project. Every stage. Every agent.

Status: M0–M4a shipped and verified (local audited agent runtime; Mastra tool seam green). Build target is a launchable app —
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
- `packages/agent-runtime` — lease-claim job runner with audited runs, local rule handlers (housekeeping, impact-nudge), and the `agent-task` LLM job (Ollama-local default, OpenAI-compatible override); Mastra Agent/tools verified for the Node/worker path

Root commands fan out: `pnpm typecheck` (all packages), `pnpm test` (core + sync suites).

## GitHub sync (two-way on PAT)

Open the Sync tab, enter owner/repo plus a fine-grained PAT with issues:read
(pull) or read+write (push). Pull turns issues into linked tasks (closed issues
arrive done); push creates missing issues and mirrors task status — Tivity wins
conflicts, so pull first. The token is held in memory only and never stored.
App auth with webhooks is still to come (M2d).
App icons are generated placeholders — replace before any public release.
