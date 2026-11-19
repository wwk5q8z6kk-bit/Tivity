# Tivity — AI-native Project Operating System

One workspace. One source of truth. Every project. Every stage. Every agent.

Product direction: one integrated replacement for Linear-style issue management,
Jira/Confluence-style planning and knowledge, and Buzz by Block-style human–agent
collaboration. See the [unified workspace scope](docs/product-direction.md).
Current delivery is a local-first foundation; shared team identity, permissions,
and real-time synchronization remain planned.

Status: M0–M5c shipped and verified (two-way GitHub sync, LLM agents, FTS5 search with hit navigation, IDE clients). Build target is a launchable app —
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

Browser regression checks (isolated browser storage, no desktop database writes):

```sh
pnpm exec playwright install chromium
pnpm typecheck:e2e
pnpm test:e2e
```

The browser runner starts its own Vite server on port 1425. On an older OS
where Playwright cannot install its bundled browser, an existing compatible
Chromium can be selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium`.
CI uses the matching Playwright Chromium on Linux. These checks cover the browser
backend; native Tauri behavior needs separate verification.

Open source adoption priorities and implementation gaps:
[open source roadmap](docs/open-source-roadmap.md).

Decisions with scored options: [docs/decisions/README.md](docs/decisions/README.md).

## Layout (pnpm monorepo)

- `apps/desktop` — React UI + Tauri shell + store wiring (`pnpm dev`, `pnpm tauri:dev`)
- `packages/core` — domain model, SQLite schema, links, store backends (dependency-free)
- `packages/github-sync` — Octokit issue pull into linked tasks (pull-only v0)
- `packages/agent-runtime` — lease-claim job runner with audited runs, local rule handlers (housekeeping, impact-nudge), and the `agent-task` LLM job (Ollama-local default, OpenAI-compatible override); Mastra Agent/tools verified for the Node/worker path
- `packages/ide-client` — IDE data path: node:sqlite opener for the desktop database, shared ops, MCP stdio server (`tivity-mcp`, 9 tools)
- `apps/vscode-tivity` — VS Code extension: 5 commands over the same database (see its README)

Root commands fan out: `pnpm typecheck` (all packages), `pnpm test` (core + sync + runtime + IDE suites).

The Connectors page provides a combined MCP client config. Build Tivity's server
with `pnpm --filter @tivity/ide-client build` first. Filesystem needs Node/npx;
the Git and Fetch reference servers need uv/uvx. Replace the path placeholders
before attaching the config to a client that uses the `mcpServers` format.

Select a task to open its Discussion in the inspector. Comments persist with
the task in SQLite or browser storage. Agents read and post through
`tivity_task_comments` and `tivity_add_task_comment` using a task id and project.
Use Refresh discussion to load comments posted through another client. Names
are display attribution; authenticated identities and remote live updates are
planned. The browser copy and native SQLite database remain separate backends.

## GitHub sync (two-way on PAT)

Open the Sync tab, enter owner/repo plus a fine-grained PAT with issues:read
(pull) or read+write (push). Pull turns issues into linked tasks (closed issues
arrive done); push creates missing issues and mirrors task status — Tivity wins
conflicts, so pull first. The token is held in memory only and never stored.
App auth with webhooks is still to come (M2d).
App icons are generated placeholders — replace before any public release.
