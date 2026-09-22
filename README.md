# Excerpt

Excerpt is a desktop Mac app for reading movie-style captions during a meeting,
capturing useful screen moments, and leaving with editable notes that retain the
conversation and visuals together.

The app works locally without an account or browser capture. Optional OpenAI note
enhancement is an explicit Preferences choice and uses a user-provided Keychain key.
Speech transcription and meeting files remain native to the Mac app.

## Development

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm build:engine
pnpm build:editor
pnpm build:mac
```

`apps/editor` (`@excerpt/editor`) is the React editor bundled into
`apps/mac/Resources/notes`. It requires Excerpt’s native bridge in production; tests
may install the explicit fake host in `apps/editor/src/test`.

The macOS target is Apple silicon on macOS 26 or later. A local signed build requires
the configured stable development signing identity. Developer ID signing, notarization,
and real hardware acceptance are separate release checks.

## Repository layout

```text
apps/mac       native capture, captions, storage, lifecycle, bundled-window host
apps/editor    local React library, meeting document, and settings editor
packages/core  extraction, composition, search, export, bridge clients
packages/types shared JSON contracts mirrored by the native models
packages/ui    shared editor and caption tokens
```
