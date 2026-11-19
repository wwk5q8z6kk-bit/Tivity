# Vector opener on Node

Status (2026-11-19): planned, not implemented. The rank-blend helper and
sqlite-vec dependency exist, but TauriStore and the MCP / IDE opener do not
use them. All current surfaces use lexical search. The files below describe
proposed work, not shipped behavior. See
[the open source roadmap](docs/open-source-roadmap.md#search-implementation-gap)
for the completion criteria and prioritized follow-up work.

## Files

1. `packages/core/src/store.ts` — optional vector search hook + blend
2. `packages/core/src/store.test.ts` — blend path with a fake vector provider
3. `packages/ide-client/src/vector.ts` — sqlite-vec load, embed, index, query
4. `packages/ide-client/src/db.ts` — wire vector search when available
5. `packages/ide-client/src/vector.test.ts` — load-or-skip proof
6. `packages/ide-client/package.json` — sqlite-vec dependency
7. `docs/decisions/README.md` — decision 0041

## Proof

`pnpm --filter @tivity/core test` and `pnpm --filter @tivity/ide-client test`. Search still returns FTS hits when vectors are absent.

# Attach stack

Buzz, AgentKit, and the official MCP reference servers stay outside the desktop bundle. The Connectors page now ships copyable attach configs for each of them, plus a combined MCP client bundle that includes Tivity. sqlite-vec is catalogued as an attachable local search path, and core gains a rank-blend helper with tests so the vector spike can land without loading a native extension in CI.

## Files

1. `packages/core/src/connectors.ts` — attach configs, AgentKit TOML, MCP bundle, sqlite-vec row
2. `packages/core/src/connectors.test.ts` — configs and attach gate
3. `packages/core/src/vector-search.ts` — reciprocal-rank blend of FTS and vector candidates
4. `packages/core/src/vector-search.test.ts` — blend tests
5. `packages/core/src/index.ts` — export vector-search
6. `apps/desktop/src/App.tsx` — copy each attach config from Connectors
7. `docs/decisions/README.md` — decision 0040

## Proof

`pnpm --filter @tivity/core test` and desktop typecheck. In the browser, Connectors shows Copy for Buzz, AgentKit, MCP reference, and the combined bundle. Held rows stay held.

# One add pattern

New requirement, New task, New doc, and the other composers used a primary button, while Ship used disclosures. N only worked on four pages. Every add control is now the same disclosure. N opens the add form for the page you are on, including Build, Quality, Release, Agents, Links, and Sync. Successful creates close that disclosure.

## Files

1. `apps/desktop/src/App.tsx` — folds for every create form, N for the current page
2. `docs/decisions/README.md` — decision 0039

## Proof

Desktop typecheck. In the browser, Tasks shows Add a task as a disclosure. N on Quality opens Add a test. Adding is not needed for proof beyond the open form. The welcome task stays To do.

# Readable work

The page described its job, but the records still looked like a wall of text. Add forms looked like plain summaries. The next gap lived only on the rail. Lists are now scannable rows. Add disclosures look like actions. When you are on the next stage, the page itself offers that action. Empty lists use a quiet empty panel. The task inspector stays in view while you scroll.

## Files

1. `apps/desktop/src/App.tsx` — page action, chooser, empty panels, status pills
2. `apps/desktop/src/app.css` — rows, folds, empty, mast, sticky inspector
3. `docs/decisions/README.md` — decision 0038

## Proof

Desktop typecheck. In the browser, Tasks shows the page action and a status pill. Build opens the pull-request form from the page action. An empty list shows the empty panel. The inspector stays sticky while the task list scrolls.

# Work first

Ask sat under twelve navigation rows, so the command was the last thing in the rail. On a phone the whole path rendered above the page. Fields in a row only had placeholders, which disappear while typing. Ask now sits under the project. The page states how many stages are recorded. On a narrow screen Build and Record start closed. Multi-field forms show a label on every field, and Ask clears after it runs.

## Files

1. `apps/desktop/src/App.tsx` — rail order, narrow path, labels, clear Ask
2. `apps/desktop/src/app.css` — stacked fields, narrow path summary
3. `docs/decisions/README.md` — decision 0037

## Proof

Desktop typecheck. In the browser, Ask is above the build path, the header reads how many stages are recorded, a pull-request field shows its label, and at 390px Build and Record start closed with no horizontal overflow.

# The stage is the page

Release opened the same page as Build, so a missing release still showed Sprint 1. Ask offered Plan, Ship, and Run, which are not on the rail. The requirement version form and the GitHub form sat open on an empty page. Release is its own page. Sync sits under Record. Ask lists the rail. Those two forms start closed. A status change tints the row for 160ms, and reduced motion skips the tint.

## Files

1. `packages/core/src/palette.ts` — one command per page, including the ship stage
2. `packages/core/src/palette.test.ts` — empty query lists pages; a stage is kept
3. `apps/desktop/src/App.tsx` — release page, Sync on Record, closed forms, moving row
4. `apps/desktop/src/app.css` — status tint
5. `docs/decisions/README.md` — decision 0036

## Proof

`pnpm --filter @tivity/core test` and desktop typecheck. In the browser, Release shows no sprint, Sync is under Record with the form closed, Ask lists Design, and Start tints the task row then returns it to To do.

# One map

The left path and the top tabs named the same work differently. Ship was one tab, while the path said Design, Build, Quality, and Release. Library, Activity, Links, and Connectors were only in the tab row. The tab row is gone. The path is the build. A Record list on the same rail opens the other pages. The ship switch says Build where it said Delivery.

## Files

1. `apps/desktop/src/App.tsx` — remove the work tab row, add Record, rename Delivery
2. `apps/desktop/src/app.css` — section labels on the rail
3. `docs/decisions/README.md` — decision 0035

## Proof

Desktop typecheck. In the browser, the work header has no tab row. Record opens Library. The build path still opens Quality, and the ship switch reads Build.

# Every page

Each work tab shows its count and a one-line purpose. Empty lists say they are empty. Links leads with the review queue and the stored links. Adding a link is a closed disclosure.

## Files

1. `apps/desktop/src/App.tsx` — tab counts, page leads, empty lists, Links order
2. `apps/desktop/src/app.css` — page lead spacing
3. `docs/decisions/README.md` — decision 0034

## Proof

Desktop typecheck. In the browser, every work tab shows a count, Requirements no longer says to add one above, and Links lists the stored connections before Add a link.

# Next opens the gap

The build path named the missing stage and opened its page with the form still closed. The Next action now opens that gap: the open task, or the add form for a sprint, pull request, screen, test, release, or agent.

## Files

1. `apps/desktop/src/App.tsx` — next action, controlled disclosures
2. `apps/desktop/src/app.css` — full-width next action
3. `docs/decisions/README.md` — decision 0033

## Proof

Desktop typecheck. In the browser, Open the open task selects the seeded task, and Add a test opens the Quality form.

# Build path on the left

The left column listed Ask and an empty action log. It now shows the project’s build, from requirements through release, using the records already stored. The first stage that is still open is marked Next. Opening a stage switches the work tab.

## Files

1. `apps/desktop/src/App.tsx` — build path in the assistant
2. `apps/desktop/src/app.css` — wider rail and stage rows
3. `docs/decisions/README.md` — decision 0032

## Proof

Desktop typecheck. In the browser, Welcome to Tivity shows requirements and design as recorded, Tasks as Next, and Quality as having no tests. Choosing Quality opens that Ship view while the path stays on the left.

# Assistant on the left

The project list was the left column, and the work area had a section row plus a page row. The left column is now a persistent assistant: Ask, the selected task, and a log of actions that actually ran. The work area has one tab row.

## Files

1. `apps/desktop/src/App.tsx` — assistant rail, flat work tabs, action log
2. `apps/desktop/src/app.css` — sticky left rail and the single tab row
3. `docs/decisions/README.md` — decision 0031

## Proof

Desktop typecheck. In the browser, the assistant stays on the left while Tasks, Ship, and Agents change, Ask still opens status for the selected task, and a status move appears in the assistant log.

# A working surface

The page was a poster: grain, glow, and a display title above the work. The command field is now the Ask bar, full width, and the selected task is its context. Quality create forms sit in closed disclosures. Agents lead with Ask and housekeeping.

## Files

1. `apps/desktop/src/app.css` — flat background, sans work type, Ask bar
2. `apps/desktop/src/App.tsx` — Ask about the selected task, Quality disclosures, Agents order
3. `docs/decisions/README.md` — decision 0030

## Proof

Desktop typecheck. In the browser, the background is flat, Ask sits under the project name, selecting the seeded task and choosing Ask about this opens the command list, and Quality shows records before an add disclosure.

# Light and lists on Ship

The shell follows the saved theme, or the system preference the first time. Light and dark share the same token names. Delivery and Design show the records first; adding a record is a closed disclosure.

## Files

1. `apps/desktop/src/App.tsx` — theme toggle, shortcut sheet, Ship disclosures
2. `apps/desktop/src/app.css` — light tokens and disclosure layout

## Proof

Desktop typecheck. In the browser, Light changes the page background, Keys opens the shortcut list, and Ship / Delivery shows Sprint 1 before “Add a sprint”.

# Lists first

The composer was the top of every daily page. New opens it, and Escape closes it. Ship is one page with Delivery, Design, Quality, and Sync. Find is no longer a page: the command field searches. Copy config puts the Tivity MCP block on the clipboard.

## Files

1. `apps/desktop/src/App.tsx` — New, Ship switch, Find removed, copy config
2. `apps/desktop/src/app.css` — spacing for the New button
3. `docs/decisions/README.md` — decision 0028

## Proof

Desktop typecheck and a browser pass: Tasks shows the list with New task, Ship switches to Delivery, Connect copies the config.

# Library and Activity

Record was four pages of the same shape. Docs and decisions now share Library, with a type switch. Evidence, memory, and agent runs share Activity. A search hit for a doc opens Library. A memory hit opens Activity.

## Files

1. `packages/core/src/search.ts` — destinations `library` and `activity`
2. `packages/core/src/sql-fts.test.ts` — the destination contract
3. `apps/desktop/src/App.tsx` — the two pages, and runs leave the Agents page
4. `docs/decisions/README.md` — decision 0027

## Proof

`pnpm --filter @tivity/core test`, desktop typecheck, and a browser pass: Library shows Project notes, Decisions shows the seeded verdict, Activity shows the evidence and the memory note, and a doc search lands on Library.

## Out of scope

A new stored type that merges docs and decisions, and moving Ship or Run into a project menu.

# Phase 2 — command field and task inspector

The task stays on screen. ⌘K opens commands for go, create, status, and the doc linked to the selected task. Choosing that doc shows it beside the task. The project rail filters by name.

## Files

1. `packages/core/src/palette.ts` — command list for an empty query and a typed phrase
2. `packages/core/src/palette.test.ts` — section list, status before create, linked doc, unmatched phrase
3. `apps/desktop/src/App.tsx` — command field, inspector, project filter
4. `apps/desktop/src/app.css` — split layout and the active command
5. `docs/decisions/README.md` — decision 0026

## Order

Pure command list and its test, then the shell. Proof is `pnpm --filter @tivity/core test`, desktop typecheck, and a browser pass: select the seeded task and read Project notes in the inspector, then run Set to Doing and Open Project notes from the command field without leaving Tasks.

## Risks

- Enter both submits the form and is handled on keydown. The keydown handler calls preventDefault while the field is focused.
- A doc with no task link still opens its own page.

## Out of scope

Merging Record into Library and Activity, drag, and a light theme.

# Phase 1 — practical daily screen

The audit is the spec. This slice is the quick-win half: the task list is the default, the board is a view, status shows Saving before the row moves, and the chrome meets the contrast and target rules from the 12 Nov 2026 review.

## Files

1. `apps/desktop/src/app.css` — rule color at least 3:1, 44px primary and rail, 22–28px project title, skip link, task list
2. `apps/desktop/src/App.tsx` — one `aria-current`, skip link, list/board, Saving, empty copy that names the next action
3. `docs/decisions/README.md` — decision 0025

## Order

Tokens and targets, then the task view and the save label, then the decision. Proof is desktop typecheck and a browser pass: skip link, list with one task, Start shows Saving then Doing, board stays unavailable until a second task exists.

## Risks

- A fast store can skip the Saving paint. The handler waits one frame after setting Saving so the label is visible before the write.
- Raising `--rule` darkens every hairline, including pills. That is the contrast fix.

## Out of scope

Command menu, inspector, merging Record into Library and Activity, drag, and a light theme. Those are phase 2 and 3.

# Practical shell

Fourteen equal destinations were the page. Sections are now five choices, and only the pages inside the current section are shown. Tasks are a To do / Doing / Done board. Connectors open on demand instead of a stack of essays.

# Connectors

Tivity is the record. Other agents reach it over MCP. The shell lists what is already connected, which permissive neighbors can be attached, and which local checkouts stay held because they have no license file. No repository is copied into this app.

## Proof

`pnpm --filter @tivity/core test` covers the license gate and the MCP config. The browser opens Connectors and shows Buzz, AgentKit, and the held rows.

# Practice pass on the ledger

The ledger shell stays. This pass corrects it against current interface practice:

- Nielsen heuristic 8: the work is the page. The title is smaller, and the summary is not repeated under it.
- Nielsen heuristic 7 and the NN/G accelerator note (Oct 2024): Find stays visible, and ⌘K / Ctrl+K focuses it. The shortcut is printed on the field.
- Search results float over the page and close with Escape, Close, or choosing a hit, so the contents do not jump.
- WCAG 2.2 labels (3.3.2): Project and Task have persistent labels. Placeholders are hints and meet contrast (1.4.3).
- WCAG 2.2 target size (2.5.8): primary buttons are at least 40px, section and row actions at least 32px.
- Heuristic 2: status buttons name the next action (Start, Finish, Reopen) instead of "advance".

# Ledger shell

The desktop shell was thirteen equal tabs on a generic dark panel. The redesign treats Tivity as a bound ledger: a project index in the margin, the project name as a masthead, contents grouped into Plan / Record / Ship / Run, and a finder that stays on the page so search is how you move.

M5c (search hits open the owning row) already shipped. This change is presentation and navigation only. Forms, stores, and handlers stay.

## Files

1. `apps/desktop/index.html` — Fraunces, Spline Sans, IBM Plex Mono
2. `apps/desktop/src/app.css` — ink, paper, copper mark, grain, grouped contents
3. `apps/desktop/src/App.tsx` — masthead finder, section nav, pending-link count
4. `docs/decisions/README.md` — decision 0023

## Proof

Desktop typecheck, then the browser at a wide width and a narrow width: open the seeded project, find “links” from the masthead, open the task, and confirm the Tasks page and the copper mark. Switch to Find, Delivery, and a narrow viewport.

## Risks

- Two finders (masthead and Find page) share one result list. Submitting either replaces it. Leaving the project clears it.
- The pending count only covers the impact queue, which lives on Links.

# M5c — Search hits open the entity

Search finds docs, memory, and tasks, then stops. Decision 0020 left results display-only because no tab knew how to select an entity. A hit should open the tab that owns it and highlight that row.

## Files

1. `packages/core/src/search.ts` — `destinationForSearchKind`, `searchHitElementId`
2. `packages/core/src/sql-fts.test.ts` — contract test for the map and element id
3. `apps/desktop/src/App.tsx` — click a hit, switch tab, mark the row
4. `apps/desktop/src/app.css` — hit button and focused row
5. `docs/decisions/README.md` — decision 0022 and roadmap line
6. `README.md` — status line through M5c

## Order

Core map and test, then the shell wiring, then the decision record. Proof is `pnpm test` plus a browser pass: search the seeded project, open a task hit, then a doc hit, and confirm the right tab and highlighted row.

## Risks

- Kind and tab names differ (`doc` vs `docs`, `task` vs `tasks`). One function owns that map so the shell cannot drift.
- A deleted entity still switches tabs and highlights nothing. That is acceptable.
- The desktop package has no unit runner. The browser pass covers the click.

## Out of scope

URL routing, searching other entity kinds, and vector search.

## Extra fix found while proving the click path

Every create form called `e.currentTarget.reset()` after an `await`. React clears `currentTarget` once the handler yields, so the save succeeded and then threw `Cannot read properties of null (reading 'reset')`, and the shell never selected the new project. Reset now uses the submit event's `target`, which stays the form. The desktop package has no component test runner, so this is proved in the browser.
