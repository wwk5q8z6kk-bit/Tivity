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

## Roadmap (from workflow synthesis, surface-adjusted)

- M0 scaffold + core tables + links + impact check (S0+S1 slice) — SHIPPED and verified
- M1 requirements versioning + propagation queue + memory whyRefs (S1+S2+S3+S10) — SHIPPED and verified
- M2a delivery entities + sync-ready refs (S6 slice) — SHIPPED and verified
- M3 design registry + quality/security/monitoring (S4+S9) — SHIPPED and verified
- M2b monorepo split + GitHub pull sync, single-user PAT (S5+S6 slice) — SHIPPED and verified
- M2c GitHub push sync on PAT (S5 slice) — SHIPPED and verified
- M2d GitHub App auth + webhooks (needs user-side App setup, see 0018 notes)
- M4a local audited agent runtime: jobs ledger + runs + rule handlers (S7 slice) — SHIPPED and verified
- M4b LLM handlers: agent-task job, Ollama-local default, native+fetch paths (S7) — SHIPPED and verified
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
