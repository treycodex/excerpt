# Excerpt

Excerpt is a desktop Mac app for reading movie-style captions during a meeting,
capturing useful screen moments, and leaving with a transcript that keeps the
conversation and screenshots together. Notes are optional.

**[Watch the 54-second demo](https://excerpt-rho.vercel.app/media/excerpt-demo.mp4)**:
real footage of the app, from setup to notes (the meeting in it is scripted).

The app works locally without an account or browser capture. Notes are written only
when you ask: on this Mac with Apple Intelligence, or with OpenAI using your own
Keychain key if you choose that in Settings. Speech transcription and meeting files
remain native to the Mac app.

## Install

Excerpt requires macOS 26 or later on Apple silicon. There are two ways to install it,
and the step-by-step version is at
[excerpt-rho.vercel.app/#/install](https://excerpt-rho.vercel.app/#/install).

### From Terminal

```sh
curl -fsSL https://excerpt-rho.vercel.app/install.sh | sh
```

This downloads the latest release, checks that the app is signed with Excerpt's
certificate, copies it into Applications, and opens it. macOS shows no malware warning,
because its first-open check applies only to files marked as downloaded, and curl does
not mark them. The script changes no security setting and will not replace Excerpt
while it is running. Read it first:
[`apps/web/public/install.sh`](apps/web/public/install.sh). Run the same line again to
update.

### From the download

[Download Excerpt.dmg](https://github.com/treycodex/excerpt/releases/latest/download/Excerpt.dmg)
from the latest release.

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
notarized by Apple. That is why macOS blocks the first launch of a browser download
(the Terminal install above avoids it). A new download is checked again, so expect
**Open Anyway** again when updating this way. On current macOS,
right-clicking the app and choosing **Open** no longer gets past this; use **Open
Anyway** as above. The button stays in Privacy & Security for about an hour after the
blocked attempt; if it has gone, open Excerpt again.

If you have already dragged it into Applications, this clears the download flag instead
of steps 2–3:

```sh
xattr -dr com.apple.quarantine /Applications/Excerpt.app
```

Or build it yourself from this repository (see [Development](#development)).

## Meeting controls

When Zoom, Teams, Meet, FaceTime, Slack, Discord or a browser call starts using the
microphone, Excerpt asks whether to start a transcript, and when the call lets go of
the microphone it asks whether to end the meeting. It never starts or stops on its
own; **Notice meetings** in the menu turns the question off. A browser can hold the
microphone for a while after a call ends (Meet's closing page does), and the end
question waits for it.

Or start from the menu, library, or ⌘⇧R. Starting leaves the meeting window closed; use
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
