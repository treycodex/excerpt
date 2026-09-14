# Excerpt

**Keep the creative, the numbers, and the conversation together.**

**Demo → https://excerpt-rho.vercel.app** — 102 seconds, nothing to install.

Meeting memory for creative and media agencies. The screen you are reviewing — a
performance report, an ad variant, a deck — goes into the notes, the speech from
either side of it sits with the picture, and every extracted item points back at the
passage it came from, so you can check it and correct it. Free, open source, and
stored on your own device.

A captured report is kept as a picture and the conversation as a transcript.
Excerpt does not read numbers off a report, verify a metric, import spreadsheets or
PDFs, or connect to an ad platform.

Captions follow the conversation while the review is happening, so you can watch
the work instead of the transcript.

Built for The Build Games as a replacement for paid AI meeting-note software.

---

## How it works

Excerpt listens to a tab (or to everything your Mac is playing) and to your
microphone, and transcribes both on your machine by default with Chrome's built-in
on-device speech engine. If that model is unavailable, cloud transcription is
offered only after explicit consent. No API keys, backend, account, or recurring cost.

```
tab or system audio  = everyone else  ─┐
                                        ├─► TranscriptEvent ─► captions · transcript · notes
microphone           = you            ─┘
```

Two streams is also the whole of what Excerpt knows about who is speaking. It can
tell **you** from **not-you**, and nothing more — so an action you commit to
yourself is assigned to you, while "can you send that?" from the other side is
left unassigned rather than guessed at.

Notes are extracted deterministically — by grammar, not by a language model. Every
line in your notes is a verbatim span of something a person actually said. It also
means Excerpt is wrong sometimes, so every item can be edited, reassigned,
recategorised, given a corrected state or due date, or dismissed.

---

## Capture a real meeting

Chrome on macOS. Go to **Capture**, then:

1. **Check the microphone** shown in the picker. A Mac will happily default to an
   iPhone's Continuity microphone or a virtual device installed by another app, and
   either one records silence while looking perfectly healthy. Excerpt flags the
   ones that usually capture nothing.
2. **Choose how it listens** — a browser tab (Meet, Zoom on the web) or anything
   playing on the Mac (the Zoom or Teams desktop app, FaceTime, a call on speaker).
3. In Chrome's picker, **tick "Also share tab audio"**. Without it Chrome shares the
   picture and no sound, and there is nothing to transcribe. Excerpt detects this
   and says so.
4. Talk. Press **End and write notes** when you're done.

If macOS has not granted Chrome screen recording, sharing fails with an unhelpful
browser error; Excerpt explains it and tells you Chrome must be fully quit and
reopened afterwards.

Both modes are verified against real audio, on-device throughout:

| | tab audio | system audio |
|---|---|---|
| captured | 2:00 | 1:34 |
| transcript rows | 21 | 18 |
| recognition | accurate | accurate |
| invented decisions | none | none |

Across roughly four minutes of speech containing no decisions, Excerpt extracted
none. That is the behaviour the whole design is for.

**Wear headphones in system-audio mode.** Through speakers your microphone hears
the far side as well, so both streams transcribe the same words and attribution
becomes a guess. Excerpt detects and drops what it can — the count is on screen —
but headphones remove the problem rather than mitigating it.

---

## What Excerpt does not claim

- **It is not an audio record.** Excerpt stores a transcript, not a recording.
  Recognition makes mistakes and you cannot check a note against the original audio.
- **Timing is approximate.** The Web Speech API exposes no timestamps at all, so
  positions are measured when text arrives and lag real speech.
- **Extraction is fallible.** Rules miss things and occasionally misfire. Nothing is
  presented as certain, and everything is correctable.
- **It cannot tell who people are.** Only whether a voice was yours.
- **It does not read your other meetings.** Preferences persist; past meetings are
  never consulted.

---

## What's in it

- **Cinematic captions** — two lines maximum, broken on phrase boundaries rather
  than width, fading rather than sliding, with the film dash convention when two
  people overlap. Optional always-on-top window so they float over your meeting.
- **The Strip** — the meeting as a film strip. Items are marks on it; selecting a
  note reveals its surrounding transcript passage and approximate position. Captured
  images appear as diamonds and open the conversation around the moment.
- **Captured moments** — the Excerpt region shortcut, pasted images and dropped
  images keep their original meeting time and nearby final speech. Images remain in
  the document position you choose, and their surrounding passage can be expanded.
- **Catch Up** — the latest 30–90 seconds stays readable while the meeting continues.
  Speech still being recognized is visibly provisional and reconciles into final
  turns without entering saved notes twice.
- **Four categories** — decisions, action items, deadlines, open questions. Chosen
  because they have crisp linguistic signatures. Ideas, quotes and risks were cut
  for having none.
- **Guards** — negation, conditionals, reported speech, future-discussion and
  questions are all rejected as decisions. "We'll discuss October next week" is a
  decision to talk, not a decision.
- **Preferences** — tell Excerpt what you care about; it shows you the exact terms
  it extracted and which of them lifted each note. Ordering only, never filtering.
- **Local recovery, library and Markdown export** — finalised capture text is
  checkpointed through interruptions; notes remain plain enough to paste anywhere.

---

## The Mac app

The website can only hear what a browser tab will hand it, and it can only draw
captions inside a page. The Mac app hears the meeting through ScreenCaptureKit and
draws the subtitles **directly over it** — no window, no panel, no box — which is the
thing a web page fundamentally cannot do.

It lives in the menu bar, and there is no window you have to keep open. Excerpt joins
the Dock the first time you open its notes or setup window and stays there until you
quit; while the captions are on screen it drops back to being a menu-bar app, which is
what lets the subtitles draw over a fullscreen meeting.

```bash
pnpm --filter @excerpt/core build:engine   # the extraction engine, for JavaScriptCore
pnpm --filter @excerpt/web  build:notes    # the notes editor, for the app's webview
cd apps/mac && ./build.sh
open build/Excerpt.app
```

First launch walks through four steps — see it, let it listen, get ready, done —
and asks for three separate permissions, because macOS treats microphone, screen
recording and speech recognition as three separate grants. Screen recording only
takes effect after the app is restarted; the setup says so rather than leaving you
looking at a tick box that appears to do nothing.

**Same engine, not a port.** What counts as a decision, what may be called an action
assigned to you, and where a subtitle breaks are compiled from `packages/core` into a
bundle the app runs in JavaScriptCore. `fixtures/parity.json` is checked by vitest
against the TypeScript and by the Swift tests against that bundle. The notes editor is
literally the web app, in a `WKWebView`, reading the Mac's own files.

### The app is unsigned

Excerpt has no Apple Developer certificate — it costs money every year, and a free
tool that costs nothing to run should not have a subscription hiding inside it. What
that means for you:

- **Gatekeeper will refuse it on first open.** Right-click the app → **Open** →
  **Open** again. macOS then remembers it. Double-clicking gives you a dialog with no
  Open button at all, which looks like the app is broken; it is not.
- If macOS says the app "is damaged and can't be opened", it was quarantined on
  download. Clear the flag: `xattr -dr com.apple.quarantine "Excerpt.app"`.
- Build it yourself and none of this applies — a locally built app is not quarantined.

`build.sh` signs with a **locally created** self-signed identity, which does nothing
for Gatekeeper and is not an Apple certificate. Its only job is keeping the app's code
identity stable between builds: permissions are keyed to identity, and ad-hoc signing
(`codesign -s -`) produces a new one every time, so every rebuild silently drops all
three grants. Measured, both ways. `apps/mac/tools/dev-identity.sh` creates one.

`build.sh` now refuses to fall back to ad-hoc signing when that identity is missing,
because a build that succeeds by erasing the next meeting's permissions is not a
successful build. From the repository root, create the identity once with
`apps/mac/tools/dev-identity.sh`. Use `EXCERPT_ALLOW_ADHOC=1` only for a disposable
build where permission persistence does not matter.

---

## Requirements

**Live capture:** macOS, Chrome 139+ (tested on 152 and 153). Chrome-only by
necessity — `SpeechRecognition.start(audioTrack)` (Chrome 135) and `processLocally`
(Chrome 139) exist nowhere else, and Firefox and Safari drop the audio track from
`getDisplayMedia` entirely.

**The demo** runs in any modern browser.

**The Mac app:** macOS 26 or later, Apple silicon. It uses `SpeechAnalyzer` and
`SpeechTranscriber`, which do not exist on earlier versions.

On-device speech needs Chrome's SODA language pack, which arrives with Live Caption
(`chrome://settings/captions`). If it is unavailable, Excerpt **stops and asks**
before using cloud transcription — it never switches silently, and the active mode
is on screen for the whole session.

---

## Development

```bash
pnpm install
pnpm dev          # http://localhost:5273
pnpm test
```

The nav bar carries the build timestamp. If it looks stale, the page is running
cached JavaScript — a hash change does not reload the bundle.

`pnpm` blocks dependency build scripts by default and *errors* rather than warns,
so `pnpm-workspace.yaml` carries an `allowBuilds` entry for esbuild. Without it
every install exits 1, including on CI.

```
apps/web        product + competition demo
apps/mac        the macOS app (SwiftPM; see apps/mac/SPIKE-RESULTS.md)
packages/core   capture adapters, extraction, scoring, export, the shared engine
packages/ui     Strip, Frame, design tokens
packages/types  shared schemas
spike/          Day 0 feasibility harness (see spike/SPIKE-RESULTS.md)
```

Three files in `apps/mac` are generated and must never be edited by hand:
`Resources/excerpt-engine.js` and `Resources/notes/` are build outputs of the web
packages, and `Captions/CaptionTokens.generated.swift` comes from
`packages/ui/src/tokens.css` — so a caption preset means one thing on both surfaces.
`build.sh` refuses to assemble a bundle if any of them is missing or stale.

`spike/` is kept deliberately. It is the throwaway harness that proved the
architecture before anything was built on it, and it records what was measured
rather than assumed — including the three failures that turned out to be bugs in
the harness itself.

---

## License

MIT — see [LICENSE](LICENSE). The coastline photograph on the landing page is
from Unsplash under its own licence; see `apps/web/public/media/CREDITS.md`.

## Write, review, and keep the visual context

Meeting notes are now an editable document. Click into any paragraph, heading, or
bullet and write directly. Use the document toolbar to add blocks, change their
style, move them, or remove them. Enter continues the document, Shift+Enter adds a
line, and Tab/Shift+Tab indents/outdents bullets. Generated wording is previewed
before it replaces generated text; your writing and image blocks are retained.

- **Live draft:** starting a Mac meeting opens the same editor used afterwards.
  Titles, writing, settled transcript text, pasted images, and shortcut captures
  merge into one recoverable draft. Closing the notes window does not stop capture.
  Ending saves and opens the meeting immediately; on-device enhancement continues
  separately and appears as a reviewable suggestion when you already wrote notes.

- **I missed that:** during a Mac meeting, press **⌘⇧J** to open a floating recent
  transcript. The compact panel opens near the captions and remembers where you
  move it. Choose 30, 60, or 90 seconds, scroll back further, and return to live
  captions with Escape or the pinned footer button. New speech arrives without
  moving your reading position; “New conversation below” takes you to the latest
  text. This is settled text, so the newest speech may still be arriving. The browser offers the same view from Capture and its floating window;
  its shortcut works while either Excerpt window has focus.
- **Screenshots:** during a Mac meeting, press **⌘⇧S** and select a region. Escape
  cancels. Excerpt attaches the image with its capture time, and places it beside
  the nearest preceding note from the conversation. These shortcuts are registered
  only while listening. You can also paste/drop an image in the Mac catch-up panel,
  or paste/drop/add images in browser Capture. Imported images during capture use
  their insertion time. Excerpt does not watch the macOS screenshot folder.
- **Images in finished notes:** paste, drop, or use **+ Image**, then choose the
  meeting time. Images have editable captions and can be moved like other blocks;
  moving them does not change their original timestamp.
- **Review:** the Review tab keeps decisions, ownership, and due dates out of the
  freeform document. Confirm an item, correct it, assign it to yourself, or dismiss
  it. Confirming is distinct from marking a task complete.
- **Transcript corrections:** choose Correct beside a passage, edit its wording,
  and review the affected notes before applying. The original text and correction
  history remain saved. Generated notes and deadlines refresh; your edited or
  previously reviewed content stays intact and is flagged for another review.
- **Export with images:** produces one self-contained HTML file that opens offline.
  Markdown remains available, but image rendering from embedded data URLs depends
  on the destination Markdown app.

Screenshots are stored locally with each meeting. Capture images are checkpointed
for interruption recovery, including meetings with no transcript yet. Images are
normalized to JPEG at up to 2400 pixels on their longest side; imports are limited
to 20 MB per image. PNG, JPEG, and WebP can be imported in the notes editor. There is
no screenshot OCR or background screenshot collection.

The older `CONTEXT.md` describes the original deterministic-only product. The Mac
app now also has optional on-device summaries, and the editable document described
above is the current notes experience.
