# Tivity decision log — research-driven, all options evaluated

Rule: no implementation choice lands without scored options behind it.
Method: shared criteria below, decisive factors called out per decision,
strongest dissent recorded, evidence cited to workflow result or inline source.

## Shared scoring criteria (1–5 each)

1. Vision fit — connected systems, requirement change propagates, no silent drift.
2. TS-stack fit — TypeScript-first, minimal second-language seams.
3. Local-first — offline SQLite, one-click/one-command launch.
4. License — prefer MIT/Apache-2.0; AGPL/EPL consequences explicit.
5. Maturity — 2026 maintenance, docs, adoption signals.
6. Integration effort — weeks to a working slice (5 = days).
7. Robustness — typed contracts, tests, understood failure modes.

## 0001 — Launch surface — DECIDED: Tauri 2 desktop app

| Option | Verdict |
|---|---|
| Tauri 2 + React + SQLite | CHOSEN — installer 2–10MB, idle 30–50MB, 0.3–1s start, capability permissions, iOS/Android path from one codebase (OpenReplay Dec 2025 via workflow result 4) |
| Electron | Rejected — 80–150MB installer, 150–300MB idle, 1–3s start; JS-only speed does not outweigh 10–15x size/memory cost |
| Local web app | Rejected for v0 — easiest to share, but user explicitly wants a launchable app |
| CLI-agent hybrid first | Rejected for v0 — research recommended it as cheapest first surface, but user overrode: "build it like an app you can launch" |

Decisive factors: user vote + efficiency (size/memory/startup).
Dissent recorded: workflow synthesis recommended pure-TS core + CLI first, Tauri in phase 2.
Mitigation: core stays pure TS behind the Store interface, so a CLI can attach later —
the multi-surface path is preserved, only the first surface changed.
Evidence: workflow results 4 (interface), 8 (synthesis); user vote 2026-11-03.

## 0002 — Tracker model — DECIDED: custom minimal, Plane-inspired concepts

| Option | Score notes | Verdict |
|---|---|---|
| Plane (AGPL-3.0) | Maturity 5, vision 4; license 1 (copyleft — vendoring infects Tivity); effort 1 (Django+React+Postgres+Redis vs our SQLite local-first) | Rejected as code dependency; ADOPT its concepts (work items, cycles, modules, views) |
| Huly (EPL-2.0) | Vision 4; maturity 2 — cloud EOL Jul 2026 + blockchain pivot reports, no public REST API; MetaBrain/CollectiveCortex unverified (huly page 404, "Soon" marketing, workflow result 7) | Rejected — instability + unverifiable AI claims |
| Custom minimal (tasks → sprints/milestones later) | License 5, TS-fit 5, local-first 5, effort 4, maturity 2 | CHOSEN |

Decisive factors: license (AGPL blocks reuse) + local-first fit (no Postgres/Redis in a desktop app).
v0 ships tasks + links; cycles/sprints/milestones follow the roadmap (M2).
Evidence: workflow results 2, 7, 8; OSSAlt Linear-alternatives guide (inline).

## 0003 — Docs/knowledge layer — DECIDED: custom block-lite docs

| Option | Score notes | Verdict |
|---|---|---|
| AFFiNE | TS/React client MIT, ~62–71k stars; but sync server EE/proprietary (open-core), AI copilot cloud-paid, local Ollama experimental only | Rejected as dependency — open-core sync + paid AI break local-first |
| AppFlowy | ~67k stars, local-first SQLite + CRDT; but AGPL apps + closed commercial server (free self-host = 1 seat + 3 guests), Rust+Flutter non-TS UI | Rejected — license + stack mismatch |
| Custom block-lite (title + body_md + frontmatter, FTS5 later) | License 5, TS-fit 5, effort 5, maturity 2 | CHOSEN |

Decisive factors: license + stack (both finalists are open-core/AGPL and partly non-TS).
Adopt their ideas (local-first docs, per-page indexing, Yjs/CRDT only if sync is ever needed).
Evidence: workflow results 2, 7.

## 0004 — Agent framework — PROVISIONAL: Mastra at M4 + AWR substrate reuse

| Option | Score notes | Verdict |
|---|---|---|
| Mastra | TS-first, agents + workflows + RAG + memory + MCP, evals, HITL, 40+ providers; v1.0 Jan 2026, YC W25, used by Replit/Salesforce (inline, secondary) | PROVISIONAL CHOSEN for agent loop |
| Vercel AI SDK | Strong for model calls/tools; thinner agent loop/memory story | Acceptable for simple call sites |
| VoltAgent | TS + memory + orchestration, but thinnest evidence | Rejected pending stronger signals |
| Existing AWR control-plane | Already in workspace: scheduler/WAL/checkpoints/replay/webhooks/Codex dispatch (workflow result 3, inspected) | ADOPT as execution substrate |

Decisive factors: TS fit + memory/workflow built-ins + maturity signals.
Not final: revisit with a spike at M4 before lock-in; no agent code in v0.
Dissent: critic flags Mastra/Vercel comparison as uninspected (no repo opens) —
treated as provisional, not proven.
Evidence: inline web research; workflow results 3, 5, 6, 8.

## 0005 — Persistent memory — DECIDED v0 + PROVISIONAL path

v0 (decided): `memory_entries` table (kind/key/value + whyRef links), modeled on
Plane's project-scope tier — simple, local, no vendor. Already in scaffold.

| Later option | Score notes | Verdict |
|---|---|---|
| Plane tiered pattern (Personal 5k/Project 8k/Workspace 12k/Agent 5k, narrowest-wins, editable) | Most explicit model in official docs (workflow result 7) | ADOPT as design pattern |
| MindVault (local :9470, 384d embeddings, auto-backlinks — already running) | Reuse 5, local-first 5, maturity 3 (config-inspected, not load-tested here) | Preferred reuse candidate for semantic search |
| Mem0 (62k stars, TS SDK) / Zep-Graphiti (Apache-2.0 temporal graph) | Maturity 4, but hosted-leaning, new vendor surface | Deferred to FTS5/vector spike |
| sqlite-vec | Local embeddings in SQLite; maturity uninspected | Spike candidate alongside MindVault |

Decisive factors: no-vendor v0 + reuse-what-runs (MindVault) before new vendors.
Open spike (carried): FTS5/JSON1 ranking + sqlite-vec vs MindVault choice.
Evidence: workflow results 3, 7, 8.

## 0006 — Local DB access — DECIDED: tauri-plugin-sql + browser fallback

| Option | Score notes | Verdict |
|---|---|---|
| tauri-plugin-sql (rusqlite bundled, `sql:default` capability) | Official plugin, zero external DB, TS API in frontend | CHOSEN for the desktop shell |
| Drizzle + better-sqlite3 | Inspected default for Node API/worker (workflow result 5); cannot run in the Tauri webview frontend | ADOPTED for future apps/api + apps/worker against the same SQL schema |
| Browser localStorage fallback | Keeps `pnpm dev` usable without Tauri | CHOSEN as dev fallback (not a data promise) |

Decisive factors: each layer gets the SQLite driver that can actually run in it.
Migrations are additive SQL (`IF NOT EXISTS`), shared by all future layers.
Robustness note (applied): every connection sets WAL + busy_timeout + foreign_keys
per inspected SQLite production guidance (workflow result 5).
Evidence: workflow results 4, 5, 8.

## 0007 — GitHub sync — PROVISIONAL: Octokit, single-user first

- Library: @octokit/rest default + @octokit/graphql for nested fetches only;
  paginate + throttling + retry plugins with required rate-limit handlers;
  webhooks over polling; ETag/cursors; 1s gap between mutating calls
  (workflow result 5, inspected GitHub + Octokit docs).
- Auth: v0 single-user fine-grained PAT; GitHub App + multi-tenant sync identity
  needs an owner decision before M2 design. No sync code in v0.

## 0008 — Repo shape — DECIDED: single app v0, monorepo at M2

v0 is one Tauri app with `src/core` kept dependency-free so it can split into
`packages/*` later. At M2 (GitHub sync + backlog/delivery) migrate to the
inspected layout: pnpm workspaces (apps/*, packages/*) + turbo.json
(build dependsOn ^build) + data/*.sqlite.db gitignored + drizzle-kit migrations
(workflow result 5). No premature monorepo scaffolding.

## 0009 — Propagation design — DECIDED: version row + impact queue + auto-memory

| Option | Score notes | Verdict |
|---|---|---|
| Impact-queue table (pending/accepted/dismissed) + BFS over links | Vision 5 (explicit no-silent-drift), effort 4, robustness 4 (pure, tested walk) | CHOSEN |
| Generic event bus/outbox only | Vision 4; effort 3 — review state still needs a queue | Folded in: reason strings carry trigger context; full outbox deferred to M2 sync needs |
| DB triggers | Robustness 2 — logic hidden from TS, untestable in fallback backend | Rejected |
| Manual trace maintenance | Vision 1 — explicitly a non-goal (workflow result 1) | Rejected |

Decisive factors: reviewable state (a human or agent can accept/dismiss each
impacted item) + testability in both backends. New versions propagate
transitively via findImpacted; v1 creates no queue rows (nothing linked yet).

## 0010 — Evidence model — DECIDED: evidence_items + justify links

EvidenceItem {title, source, detail} linked to requirements through the links
table with relation `justifies`/`cites`. Rejected: a separate citations table
(over-normalized for v0) and embedding evidence in the requirement body
(loses reuse across requirements). Evidence participates in impact display
but never triggers propagation on its own.

## 0011 — Delivery model — DECIDED: local entities + links + external_refs

| Option | Score notes | Verdict |
|---|---|---|
| Custom minimal delivery (sprints, milestones, PRs, releases as local entities, wired by links) | License 5, TS-fit 5, local-first 5, effort 4 | CHOSEN |
| Plane cycles/modules concepts | Maturity 5 as reference; AGPL blocks code reuse | Concepts only (cycles→sprints, modules→milestones) |
| GitHub Projects as source of truth, no local entities | Vision 3, local-first 1 — cloud-only means offline delivery is dead | Rejected — local entities are primary, GitHub is mirrored at M2b |
| GitHub ids as columns on tasks/projects | Requires ALTER TABLE, which SQLite cannot re-run safely in idempotent migrate() | Rejected |
| external_refs table (entity, service, external id) + sync_state cursors | Additive, sync-ready, zero migrate() hazard | CHOSEN |

Decisive factors: offline-first (delivery works with no network) + additive schema
(new tables only; links carry task-partOf-sprint, task-closedBy-PR, PR-shipsIn-release).
Dissent: PRs/releases without live sync are bookkeeping-only until M2b — accepted;
every field needed by sync (branch, external ids, cursors) ships now, and live sync
waits only on the owner auth decision in 0007.
Evidence: workflow results 2, 5, 8; decision 0002/0007.

## 0012 — Design registry — DECIDED: screens + components tables, map in links

| Option | Score notes | Verdict |
|---|---|---|
| screens + components tables; map structure (contains, navigatesTo) in generic links | License 5, TS-fit 5, effort 5 — zero new plumbing, impact propagation works automatically | CHOSEN |
| Separate screen_map_edges table | Extra table + parallel walk logic for identical data | Rejected — duplication without benefit at this scale |
| Canvas/whiteboard editor (AFFiNE-style) | Vision 4, effort 1 — months of work, needs CRDT/sync | Rejected for v0; concepts only |

Decisive factors: reuse of the links substrate (every screen/component is
impact-traceable from day one) + minimal new code.
Evidence: decisions 0003, 0009.

## 0013 — Quality/security/monitoring — DECIDED: local registries, manual runs

| Option | Score notes | Verdict |
|---|---|---|
| Local registries: test_cases + test_runs history, quality_gates, security_findings, monitor_checks | License 5, local-first 5, effort 4 — works offline, full history | CHOSEN |
| External CI as source of truth (no local entities) | Local-first 1, robustness 2 — dead offline, no history ownership | Rejected — mirror later like GitHub (0007 pattern) |
| Blocking release automation on gate status | Vision 4, effort 2 — needs execution engine (M4 agent runtime) | Deferred to M4; v0 records + displays status only |

Decisive factors: offline-first history ownership + M4 keeps the automation door open.
Dissent: statuses are human-recorded until CI/agent feeds arrive — accepted and
labeled as such in the UI; no fake automation.
Evidence: workflow result 1 (S9), decision 0007 pattern.

## 0014 — Monorepo shape — DECIDED: pnpm workspaces, no orchestrator yet

| Option | Score notes | Verdict |
|---|---|---|
| pnpm workspaces (apps/*, packages/*) + root scripts via --filter/-r | Effort 4, robustness 4 — native pnpm, zero new tools | CHOSEN |
| + Turborepo orchestrator | Pays off at 5+ packages or slow CI; 3 packages today | Rejected for now — revisit when a 4th package lands or CI needs caching |
| Nx | Heavier than the problem (workflow result 5 cites both; Turborepo pattern is lighter) | Rejected |
| Stay single-package | Blocks M4 worker from sharing core without copy-paste | Rejected |

Shape: apps/desktop (React + Tauri shell + store wiring), packages/core
(pure TS: types, schema, links, both store backends), packages/github-sync
(Octokit pull → tasks). Core consumes TS source directly (no build step).
Dissent: splitting one app is slightly early — accepted, because M4's worker
is next and splitting now means sync is born in the right place instead of
being migrated twice.
Evidence: workflow result 5 (finografic/turborepo inspection).

## 0015 — Sync design — DECIDED: pull-only v0, token in memory

| Option | Score notes | Verdict |
|---|---|---|
| Pull-only: GitHub issues → tasks + external_refs + cursor, idempotent re-pull | Vision 4, effort 4, robustness 4 (fake-client tested, no network in tests) | CHOSEN for v0, labeled pull-only in UI |
| Bidirectional now | Needs conflict resolution + the App-vs-PAT call (0007) | Rejected for v0 — arrives with M2c |
| Token in component memory only, never persisted | Robustness 4 (nothing to leak on disk), effort 5 | CHOSEN — OS keychain deferred with App decision |
| Octokit official + throttling + retry plugins | Inspected docs (0007): paginate, rate-limit handlers required | CHOSEN — no community wrappers |
| Skip PRs in issue listing | PRs map to pull_requests entities, a separate sync path | CHOSEN — issues only until PR sync is designed |

Decisive factors: honesty (labeled limits, no fake push) + testability (injected
client) + the recorded 0007 provisional path (single-user PAT).
Evidence: workflow result 5 (Octokit inspection), decision 0007.

## 0016 — Agent runtime shape — DECIDED: SQLite jobs ledger + audited runs + local handlers

| Option | Score notes | Verdict |
|---|---|---|
| SQLite jobs ledger (claim/complete/requeue) + agent_runs audit + local rule handlers, new packages/agent-runtime | License 5, TS-fit 5, local-first 5, effort 4, robustness 4 (fake-store tested) | CHOSEN for M4a |
| Vendor AWR LeaseScheduler as-is | Concept 5; implementation needs Postgres (RunsRepository takes pg PoolClient, pool defaults to DATABASE_URL — inspected this session) — no PG server inside the desktop-local path | Rejected as code; ADOPT the pattern (lease claim + attempts + retry-after backoff) |
| BullMQ/Temporal/Inngest now | Needs Redis/server/cluster (workflow result 5) | Rejected for local-first v0 |
| LLM-driven handlers now | Needs provider + keys + Mastra verdict (0017) | Deferred to M4b |

Decisive factors: runs offline with zero new infrastructure + every run is audited
(agent, job, task refs, status, summary) + the runner takes an injected Store so
the same code drives Tauri SQLite and tests.
Dissent: rule handlers are not "AI agents" yet — accepted and labeled; they prove
the ledger, audit trail, and retry semantics that LLM handlers will reuse.
Evidence: AWR src/scheduler/leaseScheduler.ts + repositories/runsRepository.ts
+ db/pool.ts (inspected); workflow result 5 (queue tradeoffs).

## 0017 — Mastra verdict — KEEP for the M4b tool seam (spike green)

Spike (this session, real install @mastra/core 1.81.0 + zod 4.6.7):
install 13.7s / +145 packages; Vitest ESM interop clean, no blowup;
createTool wraps the Tivity Store with zod input/output schemas; direct
execute passes. Contract learned: execute(inputData, ctx) with schema
validation (passing {context} as input fails validation — first spike run
caught it). Standing proof: packages/agent-runtime/src/mastra.test.ts.

| Option | Score notes | Verdict |
|---|---|---|
| Mastra tools as the M4b LLM seam | Spike green on every falsifiable claim | KEEP — provisional 0004 upgraded to confirmed for tools |
| Hand-rolled agent loop instead | The interop risk that motivated it did not materialize | Rejected |
| Promote @mastra/core to dependencies now | No production import yet; runner/handlers are dependency-free | Rejected — stays devDeps until M4b handlers import it |

Dissent/caveat: Agent-loop-with-model and provider billing are still unverified
(no keys in session) — M4b needs provider choice + keys before LLM handlers ship.
Evidence: mastra.test.ts (passing) + installed tool.d.ts contract.

## 0018 — Push sync — DECIDED: Tivity-wins push on PAT, per-task cursors

| Option | Score notes | Verdict |
|---|---|---|
| Push: new tasks → issues.create; linked tasks → issues.update only when status drifted from a per-task push cursor | Effort 4, robustness 4 (fake-client tested, per-item 404 tolerance) | CHOSEN for M2c |
| Always-update every linked task | Wastes rate limit, noisy issue timelines | Rejected |
| Per-task cursor in sync_state (`push:{taskId}` → last status) | Zero new tables, reuses tested upsert | CHOSEN over a new push_state table |
| Tivity-wins conflicts, documented; pull-then-push recommended flow | Honest, simple; true merge needs the App + webhook design | CHOSEN for v0 |
| GitHub App now | Needs user-side App registration + public webhook URL — impossible to complete in-session | Still deferred (0007); exact user steps recorded in M2c notes below |

Decisive factors: no redundant API calls (cursor compare) + per-item error
tolerance (one 404 never aborts the push) + no new tables.
Auth: single-user fine-grained PAT (issues: read+write), memory-only, same as pull.
Evidence: Octokit REST issues.create/update (0007 inspection).

M2c App-path notes (for the owner, when ready): create a GitHub App with
issues read/write + metadata, install on target repos, run a small webhook
receiver for issue events into sync_state cursors, then flip push/pull auth
from PAT to installation tokens. Nothing in the v0 schema blocks this.

## 0019 — LLM handlers — DECIDED: Mastra Agent, Ollama-local default, cloud override

| Option | Score notes | Verdict |
|---|---|---|
| Mastra Agent + store tools (list open tasks, read task context, record note), model injected | Tool seam already green (0017); agent takes any LanguageModelV2 | CHOSEN |
| Ollama-local default model (qwen2.5-coder:7b verified running this session) | Local-first 5, cost 5 (free), privacy 5, quality 3 | CHOSEN default — no keys needed |
| OpenAI-compatible override via env (baseURL + key + model) | Quality 4, needs billing + keys | CHOSEN as override path, same code path |
| New `agent-task` job type: payload {taskId, goal} → agent reads linked context → writes memory note + run summary, never auto-mutates entities | Robustness 4 (note-only side effects) | CHOSEN — auto-mutation needs approval UX (future) |
| Committed tests calling live models | Flaky, needs network/keys/GPU in CI | Rejected — committed tests use tool-unit + fake-agent plumbing; live call verified by throwaway probe |

Decisive factors: runs for free offline-first today (Ollama) + provider swap is one
env change + committed suite stays hermetic while a live probe proves the real path.
Evidence: 0017 spike; Ollama /api/tags live probe (qwen2.5-coder:7b present).

Live result (this session, throwaway probe, file deleted after): full path green —
createModel → Mastra Agent.generate → executeAgentTask → memory note asserted.
First run timed out on Ollama cold start (~3 min model load); warm rerun passed
in ~10s. Committed tests cover everything except the billed/live call.

Build-failure finding (same session, reshaped the client path): @mastra/core is
Node-only — it imports stream/https/net/child_process (+posthog-node), and vite
cannot bundle it into the frontend (Rollup externalization of `Transform` fails
the build). So: Mastra stays in agent-runtime for Node/tests/worker only (back
to devDeps; ./llm not re-exported from the package index); the shipped client
path is dependency-free fetch to the OpenAI-compatible endpoint. CORS probes:
browser-dev origin (http://localhost:1420) gets Access-Control-Allow-Origin from
Ollama; tauri://localhost gets no usable answer — therefore the desktop app
calls a native Rust command (llm_chat, reqwest) first and falls back to fetch
for browser dev. @ai-sdk/openai-compatible was removed again (nothing uses it).
Live probe v2 (throwaway, deleted): default agent-task path green end to end —
runDueJobs → fetch → memory note asserted in 57s. The Tauri-invoke branch is
typechecked and compiles but cannot run headless; first desktop launch should
watch the Agents tab result line.

## 0020 — Search — DECIDED: FTS5 per-source indexes, LIKE fallback, node:sqlite tests

| Option | Score notes | Verdict |
|---|---|---|
| FTS5 external-content tables + insert/delete/update triggers per source (docs, memory, tasks); project filter via rowid join; user input sanitized into quoted-phrase AND queries | Vision 4 (unified find), robustness 4 (no MATCH-injection crashes) | CHOSEN |
| LIKE fallback when FTS is unavailable (migrate + query both guarded) | Degradation 5 — search never breaks the app, only loses ranking | CHOSEN as fallback, not primary |
| Committed SQL tests on node:sqlite (zero new deps, FTS5 verified present) running the real MIGRATIONS strings + shared query builders | Proof 5 — tests the actual SQL, not a model of it | CHOSEN over better-sqlite3 (native-build friction under pnpm ignored-scripts) |
| Single unified FTS index | Saves 2 tables, complicates triggers + kind attribution | Rejected — per-source keeps triggers trivial |
| Results display-only in v0 | Effort 5; tabs have no entity deep-link routing yet | Superseded by 0022 — navigation shipped once a hit could name its tab |

Decisive factors: ranked search with zero new dependencies + the safety net (LIKE)
means FTS absence anywhere (older SQLite, odd drivers) degrades quality, never
availability.
Evidence: node:sqlite FTS5 probe green this session.

## 0021 — IDE extension client — DECIDED: MCP stdio server + VS Code extension, direct SQLite open

Client surface — one agent path, one human path, shared ops:

| Option | Score notes | Verdict |
|---|---|---|
| MCP stdio server (@modelcontextprotocol/sdk 1.x, MIT): tools for projects/search/tasks/memory/impact | Vision 5 (every IDE agent — Copilot, Cursor, Claude Code — from one server), TS-fit 5, effort 4, robustness 4 (stdio = child process, no ports/auth) | CHOSEN — agent path |
| VS Code extension (official Extension API, TS): commands + settings | Maturity 5 (tens of thousands of extensions; works in VS Code + forks incl. Cursor), TS-fit 5, effort 4 | CHOSEN — human path |
| Zed extension | WASM/Rust seam, catalog ~200, narrow API (secondary sources agree) | Rejected — reach + stack mismatch |
| JetBrains plugin | Kotlin/JVM second-language seam, effort 1–2 | Rejected — stack mismatch |
| LSP server | Serves language features; Tivity has none | Rejected — wrong fit |
| Neovim plugin | Lua seam, smaller audience | Rejected — stack + reach |

Data path — clients open the desktop's database file directly:

| Option | Score notes | Verdict |
|---|---|---|
| Direct open of tivity.db via node:sqlite; WAL + busy_timeout posture already shared | Local-first 5, effort 4, robustness 4 (SQLite concurrent readers/writers, zero new deps on Node 24) | CHOSEN |
| Local HTTP sidecar between clients and DB | New ports/auth/lifecycle for no benefit at this scale | Rejected |
| better-sqlite3 / vscode-node-sqlite3 native modules | Native-build friction (0020 precedent); Electron-ABI prebuilds for extensions | Rejected |
| MCP SDK v2 line (@modelcontextprotocol/server 2.x) | Implements 2026-07-28 spec, but 1.x is latest stable (1.30–1.32) | Rejected for v0 — migrate later |

Path resolution: TIVITY_DB_PATH env → `tivity.dbPath` setting → platform
default under the Tauri app-data dir for `com.tivity.app`
(macOS `~/Library/Application Support/…`, Linux `~/.local/share/…`,
Windows `%APPDATA%/…`). migrate() on open (idempotent); ensureSeeded only
when empty — the same contract as the desktop, so whichever surface runs
first owns the seed. node:sqlite is builtin on Node 24 and Electron 35+
(Node 22.9+); older/remote hosts (e.g. Cursor remote on Node 20) get a
clear error naming the blocker, not a silent failure.

v0 surface (7 tools, 5 commands): projects, search, tasks, create-task,
set-task-status, record-memory, impact. Writes are explicit user/agent
actions only — the 0019 note-only spirit holds (no auto-mutation).
Committed tests stay hermetic: ops against a fake Store, node:sqlite
adapter against temp files, MCP protocol via the SDK's in-memory
transport; packaging (.vsix) and Marketplace/OpenVSX publish are
documented user-side steps, like the 0018 App path.
Evidence: MCP TS SDK README (MIT, McpServer/registerTool/
StdioServerTransport, zod peer) + npm 1.x stable line; Electron
35+/Node 22.9+ node:sqlite builtin reports; Cursor remote Node 20
caveat; Zed catalog/extension-API maturity reports (secondary).

## 0022 — Search navigation — DECIDED: a hit opens its tab and highlights the row

| Option | Score notes | Verdict |
|---|---|---|
| `destinationForSearchKind` maps doc/memory/task onto Docs, Memory, Tasks; the row shares `searchHitElementId` and gets a focus outline | Vision 5 (find then act), effort 5, robustness 4 (closed union, no router) | CHOSEN |
| Stay display-only | Vision 2 — the user still hunts the tab by hand | Rejected — the deferral in 0020 was only until a tab could be named |
| Client-side URL router | Effort 2 — new dependency for three destinations and no other routes | Rejected |

Decisive factors: the searchable kinds already have tabs, and one pure map keeps the shell from inventing a second naming scheme.
A missing row (deleted after the search) still switches tabs and highlights nothing.
Evidence: `destinationForSearchKind` contract test; browser pass on the seeded project.

## 0023 — Shell — DECIDED: ledger masthead, grouped contents, finder on the page

| Option | Score notes | Verdict |
|---|---|---|
| Editorial ledger: ink/paper/copper, Fraunces masthead, contents grouped Plan / Record / Ship / Run, finder stays in the masthead | Vision 5 (the link is the product, so navigation is a contents page), effort 4 | CHOSEN |
| Restyle the existing 13 equal pills | Vision 2 — paint on the same hunt | Rejected |
| Add a client router and one route per tab | Effort 2 — new dependency, no shareable URLs required yet | Rejected |

Decisive factors: the user asked for a redesign, and the searchable kinds already jump to a tab (0022), so the finder can sit above the work instead of inside one tab.
The Find page stays, and both finders write the same result list.
Evidence: browser pass on wide and narrow widths.

## 0024 — Connectors — DECIDED: MCP catalog, permissive neighbors only, no vendoring

| Option | Score notes | Verdict |
|---|---|---|
| Catalog in the shell: built-in MCP/GitHub/Ollama/VS Code, attach Apache/MIT neighbors, hold checkouts with no LICENSE | Vision 5 (the record is useful when other agents can reach it), license 5, local-first 5 | CHOSEN |
| Vendor Buzz, AgentKit, Hydra, and AWR into this repo | Effort 1, local-first 1 — Rust relay, Python workers, and a Postgres runtime do not belong in the desktop bundle | Rejected |
| Pretend a marketplace install button cloned them | Robustness 1 — a button that cannot run those processes would be a fake connection | Rejected |

Decisive factors: Tivity is already an MCP server with seven tools. Interop is a client config plus a license gate, not a pile of imported repositories.
Buzz (Apache-2.0) and AgentKit (MIT) are attachable. agent-os, Hydra Brain, and the workflow runtime stay held because those checkouts have no LICENSE file. The official MCP reference servers are MIT plus Apache-2.0.
Evidence: `connectors.test.ts`.

## 0025 — Daily screen — DECIDED: list first, board as a view, visible save

| Option | Score notes | Verdict |
|---|---|---|
| List by default, board when two or more tasks exist, inspector and command menu later | Learnability 5, speed at 50 tasks 5, effort 3, keeps the ledger 4. Total 17 | CHOSEN |
| Token polish only: contrast, 44px targets, shorter title, same five sections | Effort 5, speed at 50 tasks 2. Total 15 | Partial, shipped as the same slice's chrome |
| Freeform spatial canvas | Learnability 2, effort 1. Total 8 | Rejected |

Decisive factors: one task in three columns leaves the work quieter than the project title. Hick's law on fourteen peer pages and Fitts's law on 32px targets are the measured friction. WCAG 2.2 SC 1.4.11 fails at about 1.5:1 for `--rule` on `--ink`. The object shell (inspector, command menu) is the next slice, not this one.
Evidence: browser pass on the list, the Saving label, and the board gate.

## 0026 — Command field — DECIDED: one field runs go, create, status, and open

| Option | Score notes | Verdict |
|---|---|---|
| The project field becomes a command list. The selected task keeps an inspector for its links and its doc | Speed 5, the proof path stays on Tasks, effort 3 | CHOSEN |
| Leave ⌘K as search-only and add the inspector later | Speed 2 — status and the doc stay on other pages | Rejected |
| Merge Docs, Decisions, Evidence, and Memory into Library and Activity in the same change | Effort 2 — a navigation rewrite on top of an unproved inspector | Rejected |

Decisive factors: the seeded task already links to Project notes. The command list puts Set to Doing and Open Project notes ahead of creating a task from that phrase, so Enter does the matching command.
Evidence: `palette.test.ts` and a browser pass on the welcome project.

## 0027 — Library and Activity — DECIDED: two pages over the existing records

| Option | Score notes | Verdict |
|---|---|---|
| Library switches between docs and decisions. Activity switches between evidence, memory, and runs. Search opens those pages | Learnability 5, effort 4, no schema migration | CHOSEN |
| Store a new unified note type and migrate docs and decisions into it | Effort 2, risk to links and search indexes | Rejected |
| Keep Docs, Decisions, Evidence, and Memory as peer pages | Speed 2 — four equal forms for two jobs | Rejected |

Decisive factors: the records already exist and are linked. The friction was choosing among four pages, not the shape of a row.
Evidence: destination test and a browser pass on the welcome project.

## 0028 — Lists first — DECIDED: New opens the composer, Ship is one page

| Option | Score notes | Verdict |
|---|---|---|
| A New button reveals the composer on Plan, Library, and Activity. Ship uses one switch. Find leaves the section list because the command field searches | The list is what the page is for, effort 4 | CHOSEN |
| Leave a form open at the top of every page | Speed 2 — the empty field outranks the one real row | Rejected |
| Delete the Ship records and keep only tasks | Vision 1 — sprints, screens, and gates are already stored | Rejected |

Decisive factors: the audit called the always-open form the thing that wins attention over the work. Search already runs from the command field.
Evidence: browser pass on Tasks, Ship, and Copy config.

## 0029 — Light theme and Ship lists — DECIDED: same tokens, records before the add form

| Option | Score notes | Verdict |
|---|---|---|
| A light palette on the same token names, plus a toggle that remembers the choice. Delivery and Design show the stored rows, with add forms inside a closed disclosure | Daily use 5, effort 3 — one stylesheet, both themes | CHOSEN |
| A second visual theme with new type and new color names | Effort 1 — the last pass already set the type | Rejected |
| Leave every Ship form open above the list | The list stays below the empty fields | Rejected |

Decisive factors: dark-only and always-open Ship forms were the remaining practical gaps after lists-first.
Evidence: browser pass — Light clears text, muted, and border contrast; Keys lists the shortcuts; Delivery shows Sprint 1 with the add form closed.

## 0030 — Working surface — DECIDED: Ask is the primary control, the page is flat

| Option | Score notes | Verdict |
|---|---|---|
| A flat background, sans for the work, and an Ask bar whose context is the selected task. Quality adds fold away. Agents lead with the ask | Human use 5 — one place to tell a person or an agent what to do, effort 3 | CHOSEN |
| A new palette and a new display face | Look 2 — the last passes already set the tokens | Rejected |
| A chat transcript with no model call | Trust 1 — a fake reply would look like an agent ran | Rejected |

Decisive factors: the grain and the display title won attention over the task. The agent path lived on a later page, behind a registration form.
Evidence: browser pass — the page background is flat, Ask is the full-width field, Ask about this opens status and the linked doc, Quality add forms are closed, and Agents leads with Ask agent. A 390px width does not scroll sideways.

## 0031 — Persistent assistant — DECIDED: left rail, one work tab row

| Option | Score notes | Verdict |
|---|---|---|
| A sticky left assistant with Ask, the selected task, and a log of real actions. One tab row for the work | Daily use 5 — the assistant stays while the page changes, effort 3 | CHOSEN |
| Keep the project list on the left and the two tab rows | The assistant was a field you scrolled away from | Rejected |
| A chat pane that invents replies | Trust 1 — a line in the log has to be something that ran | Rejected |

Decisive factors: the left column was project navigation, and the work area asked for a section and then a page.
Evidence: browser pass — the assistant is a sticky 300px column on the left, the work area is one tab row, Ship keeps the assistant and its log, and Start writes “Moved … to Doing” before the sample task is reopened.

## 0032 — Build path — DECIDED: the left column shows the engineering stages

| Option | Score notes | Verdict |
|---|---|---|
| A stage list on the left, counted from stored requirements, tasks, design, pull requests, tests, releases, and agents. The first open stage is Next and opens that page | Daily use 5 — a person can see the whole build, effort 3 | CHOSEN |
| Leave Ask and the empty log as the whole left column | The column does not show a development path | Rejected |
| A generated plan that is not tied to stored records | Trust 1 — an empty test list has to mean there are no tests | Rejected |

Decisive factors: the product already stores the full-stack records. The left column was not showing them.
Evidence: browser pass — Welcome to Tivity shows 1 requirement, Tasks as Next with 1 to do, 1 screen and 1 component, an active sprint with no pull request, no tests, and no release. Choosing Quality opens that Ship view and leaves the path on the left.

## 0033 — Next opens the gap — DECIDED: the next action lands on the missing work

| Option | Score notes | Verdict |
|---|---|---|
| A button for the first open stage. Tasks selects the open task. An empty sprint, pull request, screen, test, release, or agent opens that add form | Daily use 5 — the path leads into the work, effort 3 | CHOSEN |
| Leave Next as a tab change with the form closed | The person still has to find the disclosure | Rejected |
| Create the missing records automatically | Trust 1 — a pull request or a test has to be written by a person | Rejected |

Decisive factors: the path already knew which stage was empty. Opening the page did not open the work.
Evidence: browser pass — Open the open task selects the seeded task and its notes. Quality opens Ship and focuses the new-test field. The task stays To do.

## 0034 — Every page — DECIDED: each tab states its job and its count

| Option | Score notes | Verdict |
|---|---|---|
| A count on every work tab, one line of purpose, and an empty line when a list has no records. Links shows the queue and the stored links before the add form | Daily use 5 — the same shape on every page, effort 3 | CHOSEN |
| Leave each page with its own empty wording and a form at the top of Links | The tabs do not tell you what is in them | Rejected |
| Hide a tab until it has records | A missing quality page would hide the gap | Rejected |

Decisive factors: the build path already named the stages. The pages themselves still differed in what they showed first.
Evidence: browser pass — every work tab shows a count. Requirements opens Offline-first launch. Library shows Project notes. Activity shows the research note. Links lists six connections with Add a link closed. Ship names the empty milestone, pull request, release, and ref lists.

## 0035 — One map — DECIDED: the left rail is the navigation

| Option | Score notes | Verdict |
|---|---|---|
| Remove the work tab row. The build path stays the engineering map. Library, Activity, Links, and Connectors sit under Record on the same rail. The ship switch uses Build for the delivery page | Daily use 5 — one set of names, effort 2 | CHOSEN |
| Keep both the path and the eight tabs | The two maps disagree, and Ship hides the stages | Rejected |
| Drop Library, Activity, Links, and Connectors | Those records are already stored and used | Rejected |

Decisive factors: a person cannot follow a build that is described twice with different words.
Evidence: browser pass — the work header has no tab row. Library in Record opens Project notes. Quality on the path opens the test form and the page title reads Quality. The ship switch reads Build and shows Sprint 1. At 390px the rail stacks and the page does not overflow.

## 0036 — The stage is the page — DECIDED: split Release and close the leftover forms

| Option | Score notes | Verdict |
|---|---|---|
| Release gets its own page. Sync moves under Record and the ship switch goes away. Ask lists the same places as the rail. The next-version form and the GitHub form start closed. A status change tints the row for 160ms unless motion is reduced | Daily use 5 — the page matches the stage you clicked, effort 2 | CHOSEN |
| Leave Release on the sprint page and keep the four-way ship switch | The rail and the page still disagree | Rejected |
| Auto-create a pull request, a test, and a release so every stage looks finished | The welcome project would no longer show the real gap | Rejected |

Decisive factors: clicking Release has to show releases, and Ask has to name the same places as the rail.
Evidence: browser pass — Release shows milestones and releases, and Add a release is the open form. Sync is under Record, with Attach a ref and Connect a repository closed. Ask Design opens the design page and lists Home. Start tints the row, and the task is back to To do. Save v2 stays closed. Build shows Sprint 1. At 390px the page does not overflow. Core tests 26 passed. Desktop typecheck passed.

## 0037 — Work first — DECIDED: command, then path, then the page

| Option | Score notes | Verdict |
|---|---|---|
| Put Ask under the project. State how many stages are recorded. On a narrow screen, start Build and Record closed. Give every field in a multi-field form a visible label, and clear Ask after it runs | Daily use 5 — the next action and the page are reachable, effort 2 | CHOSEN |
| Leave Ask at the bottom of the rail and keep placeholder-only fields | The command and the field names are easy to lose | Rejected |
| Collapse the path on desktop too | The path is the map, and a wide screen has room for it | Rejected |

Decisive factors: a person should reach the command and the page without scrolling past the whole map, and a field should keep its name while it is being filled.
Evidence: browser pass — Ask sits above the build path. The header reads 3 of 7 stages recorded. Build opens the pull-request form with Title and Branch labeled. Asking for Design opens that page and clears the field. At 390px Build and Record start closed, and the page does not overflow.

## 0038 — Readable work — DECIDED: rows, page action, and a sticky inspector

| Option | Score notes | Verdict |
|---|---|---|
| Make stored lists into scannable rows. Style add disclosures as actions. When the open page is the next stage, put that action on the page. Empty lists use a quiet empty panel. Keep the task inspector sticky while the list scrolls | Daily use 5 — the page is readable and the next step is on it, effort 2 | CHOSEN |
| Leave dense text lists and keep the next action only on the rail | A person on the page still has to look left to know what to do | Rejected |
| Redesign the color theme again | The structure and density are the problem, not the palette | Rejected |

Decisive factors: a full-stack pass has to be readable at a glance, and the next gap has to be reachable from the page you are already on.
Evidence: browser pass — Tasks shows Open the open task on the page and selects the seeded task. Status pill uses todo. Quality shows the empty panel for tests and a bordered Add a test control. Build shows No pull requests yet in the empty panel and a 48px list row for Sprint 1. The inspector is sticky. The mast has a bottom rule. Desktop typecheck passed.

## 0039 — One add pattern — DECIDED: every create form is a disclosure

| Option | Score notes | Verdict |
|---|---|---|
| Replace the New button composers with the same disclosure pattern as Ship. N opens the add form for the current page, including ship stages, agents, links, and sync | Daily use 5 — one way to add, effort 2 | CHOSEN |
| Keep the New button on Plan and Library pages | Two add patterns force people to relearn each page | Rejected |
| Auto-open every add form | The page fills with empty forms again | Rejected |

Decisive factors: a person should press N anywhere and get the same kind of add control.
Evidence: browser pass — Tasks shows Add a task closed. N on Library opens Add a doc and focuses Doc title. Quality opens Add a test. Requirements shows Add a requirement. The welcome task stays To do. Desktop typecheck passed.

## 0040 — Attach stack — DECIDED: copyable MCP configs + sqlite-vec blend spike

| Option | Score notes | Verdict |
|---|---|---|
| Keep neighbors outside the bundle. Ship copyable MCP/AgentKit attach configs for Buzz, AgentKit, and the official reference servers. Catalogue sqlite-vec (MIT/Apache) and land a pure rank-blend helper with tests; load the native extension in a later opener spike | Vision 5, license 5, local-first 5, effort 3 | CHOSEN |
| Vendor Buzz, AgentKit, and MCP servers into apps/desktop | Rejected by 0024 — wrong runtimes inside the shell | Rejected |
| Attach agent-os, Hydra, and AWR now | No LICENSE in those checkouts | Rejected |
| Require sqlite-vec in CI before the blend lands | Native loaders differ per platform; blocks the spike | Rejected |

Decisive factors: excellence comes from attachable permissive neighbors and a local vector path, without infecting the desktop bundle or ignoring the license gate.
Evidence: core tests 30 passed (connectors + vector blend). Desktop typecheck passed. Browser Connectors shows 12 entries, Copy config on Tivity MCP, Full MCP attach bundle, Buzz, AgentKit, MCP reference servers, and sqlite-vec. Held rows stay unspecified.

## 0041 — Vector opener on Node — PLANNED: optional sqlite-vec in the IDE/MCP path

| Option | Score notes | Verdict |
|---|---|---|
| Add an optional vector provider on TauriStore that blends with FTS. Load sqlite-vec in the Node IDE/MCP opener when present, with a local bag-of-words embedding. Skip quietly when the extension cannot load. Leave browser and Tauri FTS-only for now | Local-first 5, license 5 (MIT/Apache), effort 3 | CHOSEN |
| Block search until sqlite-vec loads everywhere | Breaks browser and Tauri today | Rejected |
| Pull Mem0 / hosted embeddings into the desktop | New vendor surface; against no-vendor memory path | Rejected |
| Require a cloud embedding API for the spike | Not local-first | Rejected |

Decisive factors: prove the blend on the path that can load extensions, without breaking surfaces that cannot.
Implementation audit (2026-11-19): the Node opener and vector integration test
are absent. Only the sqlite-vec dependency and pure rank-blend helper exist.
This decision remains planned; search still uses the lexical path. See
[completion criteria](../open-source-roadmap.md#search-implementation-gap).

## 0042 — Integration reliability — DECIDED: official MCP launchers and Playwright

Use the official Python `uvx` launchers for Git and Fetch reference servers;
keep filesystem on `npx`. Include prerequisites in copyable connector guidance.
Add Playwright as a development dependency for browser flows, with an isolated
Vite server and fresh storage per test. CI checks the workspace and browser flows.

Alternatives considered: introducing another application framework duplicates
the shipped shell; adding more connector entries without verifying their commands
does not improve usability. Native Tauri verification remains separate.

Sources and adoption order: [open source roadmap](../open-source-roadmap.md).

Evidence: 80 unit tests and five Chromium browser tests passed locally, along
with workspace and browser-test type checks, the web build, the MCP bundle,
and the VS Code compile. Local browser tests used an existing Chromium through
the executable override because this machine runs macOS 13. CI has been added
for Linux but has not yet run on GitHub.

## 0043 — Unified replacement scope and native task discussion

The product target is one workspace covering Linear-style daily issue work,
Jira/Confluence-style planning and knowledge, and Buzz by Block-style human–agent
collaboration. Native collaboration is part of Tivity's scope. Buzz can remain an
optional migration bridge. See [product direction](../product-direction.md).

The first implemented slice is task discussion: an additive SQLite table and
backward-compatible browser storage field, a task-inspector composer, and two
MCP tools for reading and posting. Comments carry project/task ids, a display
author, body, and timestamp. Both stores reject empty content and invalid
project/task combinations. Existing tasks and identifiers are preserved.

This is local persisted discussion. Display authors are not authenticated
identities. Shared membership, server authorization, real-time synchronization,
channels and notifications remain required work for the replacement target.
The UI offers manual refresh for comments from another SQLite client.

Verification covers both store backends, idempotent migration, persistence,
project isolation, input validation, MCP round trips, native database reopening,
and the browser task-discussion flow.

## Roadmap (from workflow synthesis, surface-adjusted)

The governing product target is now the [unified workspace](../product-direction.md):
native issue tracking, knowledge, delivery and human–agent collaboration intended
to replace Linear, Jira/Confluence and Buzz by Block. The milestones below describe
the existing foundation, not full replacement parity.

- M0 scaffold + core tables + links + impact check (S0+S1 slice) — SHIPPED and verified
- M1 requirements versioning + propagation queue + memory whyRefs (S1+S2+S3+S10) — SHIPPED and verified
- M2a delivery entities + sync-ready refs (S6 slice) — SHIPPED and verified
- M3 design registry + quality/security/monitoring (S4+S9) — SHIPPED and verified
- M2b monorepo split + GitHub pull sync, single-user PAT (S5+S6 slice) — SHIPPED and verified
- M2c GitHub push sync on PAT (S5 slice) — SHIPPED and verified
- M2d GitHub App auth + webhooks (needs user-side App setup, see 0018 notes)
- M4a local audited agent runtime: jobs ledger + runs + rule handlers (S7 slice) — SHIPPED and verified
- M4b LLM handlers: agent-task job, Ollama-local default, native+fetch paths (S7) — SHIPPED and verified
- M5a FTS5 search over docs/memory/tasks (S8 slice) — SHIPPED and verified
- M5b IDE extension client: MCP stdio server + VS Code extension (S8) — SHIPPED and verified
- M5c search hit opens the owning tab and highlights the entity — SHIPPED and verified
- M4 agent runtime on Mastra + AWR substrate, audited runs (S7)
- M5 hardening, FTS5/vector search, IDE extension client
- (Original P5-Tauri-shell milestone folds into M0 per decision 0001 override)

## Carried unresolved items (do not build on assumptions)

1. GitHub App vs PAT for multi-project sync — owner decision before M2.
2. FTS5/JSON1 ranking + sqlite-vec vs MindVault spike — before M1 search.
3. drizzle node:sqlite vs better-sqlite3 maturity — better-sqlite3 provisional.
4. OpenClaw `~/.openclaw/os/` (:8311) absent from listing — verify before reuse.
5. AWR canonical copy (`/Users/x/autonomous-workflow-runtime` vs
   `Projects/GitHub/autonomous-workflow-runtime`) — stale-link sweep before reuse.
6. Landscape claims still secondary-source-only (except P7 memory rows) —
   verify against official docs before competitive bets.
