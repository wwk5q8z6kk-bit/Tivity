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

## Roadmap (from workflow synthesis, surface-adjusted)

- M0 scaffold + core tables + links + impact check (S0+S1 slice) — SHIPPED and verified
- M1 requirements versioning + propagation queue + memory whyRefs (S1+S2+S3+S10) — SHIPPED and verified
- M2a delivery entities + sync-ready refs (S6 slice) — SHIPPED and verified
- M3 design registry + quality/security/monitoring (S4+S9) — SHIPPED and verified
- M2b GitHub live sync (needs owner auth decision, 0007) + monorepo split (S5+S6)
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
