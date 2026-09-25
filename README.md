# Excerpt

Excerpt is a desktop Mac app for reading movie-style captions during a meeting,
capturing useful screen moments, and leaving with editable notes that retain the
conversation and visuals together.

The app works locally without an account or browser capture. Optional OpenAI note
enhancement is an explicit Preferences choice and uses a user-provided Keychain key.
Speech transcription and meeting files remain native to the Mac app.

## Meeting controls

Start from the menu, library, or ⌘⇧R. Starting leaves live notes closed; use **Open
live notes** when you want to write. Ending opens the saved meeting. Cinema captions
are on by default, and ⌘⇧C toggles them. Capture moment (⌘⇧S) and Catch up (⌘⇧J)
are available during a meeting. If another app owns a shortcut, use the menu and
check **Settings → Keyboard shortcuts**.

Setup includes an optional 15-second microphone and meeting-audio check that saves
nothing. Settings uses the same native caption and microphone choices as the menu
and setup. End a meeting before changing its selected microphone. Captions can be
visible in screen recordings and screen sharing; check the meeting app's preview.

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
the configured stable development signing identity and full Xcode (the Command Line
Tools alone lack the Foundation Models macros used by the app). Developer ID signing, notarization,
and real hardware acceptance are separate release checks.

A focused controller build can run without those macros:

```sh
python3 apps/mac/tools/test-phase4-controllers.py --build-only
```

This uses the actual controller sources in a temporary package. Omit `--build-only`
to run its tests when the toolchain includes Swift Testing. It supplements the full `swift test --package-path apps/mac` gate, which is still required with Xcode.

## Repository layout

```text
apps/mac       native capture, captions, storage, lifecycle, bundled-window host
apps/editor    local React library, meeting document, and settings editor
packages/core  extraction, composition, search, export, bridge clients
packages/types shared JSON contracts mirrored by the native models
packages/ui    shared editor and caption tokens
```
