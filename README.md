# Tivity — AI-native Project Operating System

One workspace. One source of truth. Every project. Every stage. Every agent.

Status: M0–M2a shipped and verified (delivery: sprints, milestones, PRs, releases, external refs). Build target is a launchable app —
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
App icons are generated placeholders — replace before any public release.
