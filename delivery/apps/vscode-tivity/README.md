# Tivity for VS Code (and forks)

Human surface for the Tivity Project OS inside your IDE: search, tasks,
memory, and the impact queue, reading the same `tivity.db` as the desktop
app. Commands (all prefixed `Tivity:`):

- Search docs, memory and tasks
- List tasks (with status filter)
- Create task
- Record memory
- Show impact queue

Settings: `tivity.dbPath` (empty = desktop database; `TIVITY_DB_PATH` env
wins when set), `tivity.project` (id or name; empty = first project).
Requires Node 22.5+ in the extension host (VS Code on Electron 35+);
older hosts get a plain error, not a silent failure.

## Run from source

```sh
pnpm install
pnpm compile      # esbuild bundle -> out/extension.js (vscode external)
# then F5 in VS Code ("Extension Development Host"), or:
npx @vscode/vsce package   # builds tivity-0.1.0.vsix (user-side step)
```

Marketplace/OpenVSX publish is a user-side step (publisher account +
`vsce publish`), like the GitHub App path in decision 0018. Command logic
lives in `src/commands.ts` with the vscode API injected, so `pnpm test`
covers every flow headless; `src/extension.ts` is the thin adapter and is
verified by typecheck + bundle only.

## Agent path (no extension needed)

IDE agents can drive Tivity over MCP stdio without this extension:

```sh
cd ../packages/ide-client && pnpm build   # -> dist/tivity-mcp.mjs
```

Then register the server in your client (command `node`,
args `[ "<repo>/packages/ide-client/dist/tivity-mcp.mjs" ]`,
env `TIVITY_DB_PATH` optional, `TIVITY_PROJECT` optional). Seven tools:
`projects`, `search`, `tasks`, `create_task`, `set_task_status`,
`record_memory`, `impact`.
