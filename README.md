# Excerpt

Excerpt is a desktop Mac app for reading movie-style captions during a meeting,
capturing useful screen moments, and leaving with a transcript that keeps the
conversation and screenshots together. Notes are optional.

The app works locally without an account or browser capture. Notes are written only
when you ask: on this Mac with Apple Intelligence, or with OpenAI using your own
Keychain key if you choose that in Settings. Speech transcription and meeting files
remain native to the Mac app.

## Install

[Download Excerpt.dmg](https://github.com/treycodex/excerpt/releases/latest/download/Excerpt.dmg)
from the latest release. It requires macOS 26 or later on Apple silicon.

1. Open `Excerpt.dmg` and drag **Excerpt** onto **Applications**.
2. Open Excerpt from Applications. macOS says Apple could not verify that Excerpt is
   free of malware, and does not open it. Choose **Done** (not **Move to Trash**).
3. Open **System Settings → Privacy & Security**, scroll to **Security**, and click
   **Open Anyway** beside “Excerpt” was blocked to protect your Mac. Choose **Open Anyway** again and
   enter your password or use Touch ID.

Excerpt then opens normally, and setup walks through the microphone, screen
recording and speech-model permissions.

### The app is unsigned

Excerpt is signed with a local certificate, not an Apple Developer ID, and is not
notarized by Apple. That is why macOS blocks the first launch. On current macOS,
right-clicking the app and choosing **Open** no longer gets past this; use **Open
Anyway** as above. The button stays in Privacy & Security for about an hour after the
blocked attempt; if it has gone, open Excerpt again.

If you prefer the Terminal, this clears the download flag instead of steps 2–3:

```sh
xattr -dr com.apple.quarantine /Applications/Excerpt.app
```

Or build it yourself from this repository (see [Development](#development)).

## Meeting controls

Start from the menu, library, or ⌘⇧R. Starting leaves the meeting window closed; use
**Open live meeting** to follow the transcript or write your own notes. Ending saves
the transcript and opens it, with screenshots at the moments they were captured.
Correct any passage there; the original wording is kept. The **Notes** tab offers
**Write notes** (generated from the transcript, each note linked to its source) or
**Write my own** (a blank page). Nothing is generated automatically. Cinema captions
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
