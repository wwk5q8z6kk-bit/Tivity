# Open source priorities for Tivity

Reviewed November 19, 2026. Keep the TypeScript, React, Tauri, and SQLite foundation. The best immediate investment is reliable integrations and repeatable verification, followed by completing local search and making the existing link graph useful on screen.

The governing scope is now the [unified workspace direction](product-direction.md):
native issue management, knowledge, delivery, and human–agent collaboration in
one app, intended to replace Linear, Jira/Confluence, and Buzz by Block.
The library recommendations below support that scope. Native task discussion
is the first implemented collaboration slice; Buzz is an optional transition
bridge rather than a required external collaboration surface.

## Shortlist

The adoption order below is a project recommendation. Licenses refer to the linked upstream code; paid products and hosted services are separate choices.

| Priority | Project | License and source | Fit and next action |
| --- | --- | --- | --- |
| Adopt now | [Playwright](https://github.com/microsoft/playwright) | [Apache-2.0](https://github.com/microsoft/playwright/blob/main/LICENSE) | Browser regression testing for the existing React app. Added five flows and CI in this change; development dependency only. |
| Repair now | [MCP reference servers](https://github.com/modelcontextprotocol/servers) | [Upstream license mapping](https://github.com/modelcontextprotocol/servers/blob/main/LICENSE) | Keep external tools beside Tivity. Fixed Git and Fetch configs to use their documented Python launchers; filesystem stays on npm. |
| Complete next | [sqlite-vec](https://github.com/asg017/sqlite-vec) | [MIT](https://github.com/asg017/sqlite-vec/blob/main/LICENSE-MIT), with Apache-2.0 as an alternative upstream | Already declared in the IDE client, but not loaded. Add an optional Node opener, real embedding provider, index lifecycle, project isolation, and native-loading integration tests before advertising hybrid search. |
| Harden next | [Octokit retry](https://github.com/octokit/plugin-retry.js) and [throttling](https://github.com/octokit/plugin-throttling.js) | MIT ([retry](https://github.com/octokit/plugin-retry.js/blob/main/LICENSE), [throttling](https://github.com/octokit/plugin-throttling.js/blob/main/LICENSE)) | Already installed and wired. Test rate limits and transient failures, bound retry policy, then persist sync progress and recovery state. Adding another GitHub client would duplicate existing work. |
| First visual feature | [React Flow](https://github.com/xyflow/xyflow) (`@xyflow/react`) | [MIT](https://github.com/xyflow/xyflow/blob/main/LICENSE) | A navigable requirements → tasks → docs → quality map, backed by the existing links table. Start with a read-only graph and impact highlighting; lazy-load the view. |
| After document editing is scoped | [Tiptap](https://github.com/ueberdosis/tiptap) | [MIT core](https://github.com/ueberdosis/tiptap/blob/main/LICENSE.md) | Structured editing for Library and requirements. Define storage format, plain-text search extraction, migration, and round-trip export first. Evaluate paid extensions separately. |
| Worker expansion | [Mastra](https://github.com/mastra-ai/mastra) | [Apache-2.0 outside enterprise directories](https://github.com/mastra-ai/mastra/blob/main/LICENSE.md) | Already a runtime dev dependency with a tool integration test. Expand in a Node worker behind the job/run ledger; preserve audit records and explicit write tools. Enterprise directories have separate terms. |

## Changes delivered

Git and Fetch launch through `uvx mcp-server-git` and `uvx mcp-server-fetch`, following their [Git](https://github.com/modelcontextprotocol/servers/tree/main/src/git#usage-with-claude-desktop) and [Fetch](https://github.com/modelcontextprotocol/servers/tree/main/src/fetch#configure-for-claudeapp) instructions. Copyable connector text states the Node and uv prerequisites, placeholder replacement, and Tivity MCP build step. A regression test covers both generated configs.

Playwright exercises task creation and persisted status, linked document search into the task inspector, unlinked document search into Library, connector setup text, and keyboard access at 390px width. The runner owns a separate Vite server on port 1425. Each test has isolated browser storage; it does not open the desktop SQLite database. CI runs unit tests, type checks, the web build, MCP and extension bundles, and Chromium tests. It retains browser failure artifacts.

## Search implementation gap

Decision 0041 and the beginning of `plan.md` describe a vector opener, but `packages/ide-client/src/vector.ts` and its test do not exist, and `openIdeStore()` does not load sqlite-vec. Core has a rank-fusion helper, but `TauriStore.search()` does not call it. Current search is lexical. The vector dependency and plan alone do not establish a working feature.

Completion criteria: a real database test loads the extension; two projects with similar content stay isolated; edits and deletions refresh the index; unavailable native extensions preserve FTS results; bundled MCP startup works; an embedding model and its license are recorded. A hashed bag-of-words vector should be described as lexical approximation rather than semantic retrieval.

## Recommended sequence

1. Run the new CI workflow on the remote repository and resolve any Linux-specific failures.
2. Complete optional Node hybrid search against the criteria above, keeping browser and Tauri behavior explicit.
3. Bound GitHub rate-limit retries and add observable sync recovery. The current throttle callbacks always request another retry.
4. Add the React Flow link map to make traceability and impact review useful during daily work.
5. Expand document editing and agent workers after their storage and execution contracts are settled.

Keep existing license holds on local neighboring projects until those repositories state their terms. No neighboring project code was copied into Tivity.
