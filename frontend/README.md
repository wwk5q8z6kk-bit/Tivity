# MindVault Frontend (Tauri + SvelteKit)

This is the desktop-first MindVault UI powered by SvelteKit + Tauri.

## Key Features

- **Rich Note Editor** (TipTap + Markdown canonical)
- AI assist endpoints: autocomplete, suggestions, transform, wiki-linking
- Task management dashboards and command palette
- Local-first, offline-friendly UX

## Development

```sh
pnpm install
pnpm dev
```

## Tauri

```sh
pnpm tauri:dev
```

For a self-contained macOS app, install both the `frontend/` and `delivery/`
dependencies with `pnpm install --frozen-lockfile` in each directory. From the
repository root, run `scripts/package_tivity_macos.sh`. It bundles the local
server and a checksum-pinned ONNX Runtime with Microsoft's license and notices.
The app launches its own loopback-only server on port 9470; close any manually
started server on that port first. Model files are **not** bundled: the default
embedding model may need a first-run download. The bundle is ad-hoc signed by
default, not notarized.

To keep builds off the internal disk, set `TIVITY_SERVER_TARGET_DIR` and
`TIVITY_DESKTOP_TARGET_DIR` to separate absolute paths on a mounted volume. The
new app is under `$TIVITY_DESKTOP_TARGET_DIR/release/bundle/macos/`.
`scripts/package_tivity_macos.sh --check /path/to/Tivity.app` verifies the
assembly. `pnpm tauri:build` alone does not assemble the macOS server or runtime.

## Tests

```sh
pnpm check
pnpm test:unit -- --run
```

## Notes

- Markdown is the canonical storage format.
- Rich editor supports WYSIWYG/Markdown/Split modes.
- AI endpoints are served by the Rust backend under `/api/v1/assist/*`.
