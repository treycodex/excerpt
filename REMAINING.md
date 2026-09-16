# Still owed

What is left after the six commits on `note-and-transcript-quality` that closed
the engine review and opportunities 4–10 of the product-experience review.
Written 16 September 2026. Nothing here is scheduled.

Each item says what is wrong, where, and — where it matters — why it was left.

---

## 1. The demo never shows the workflow the product is for

**Blocked on one input: a sample screenshot to review** (a report, an ad variant,
a layout).

`apps/web/src/demo/script.ts` produces transcript and items but no captured
images and no annotations, so a visitor sees captions and extracted sentences and
never sees the thing Excerpt exists to do — the image, the discussion around it,
and the agreed change, together. This was opportunity 6 of the product review and
the only one not started.

The features all exist; what is missing is the asset and the scripted beats. Once
there is an image: add a capture beat, a recovered requirement and an
observation, and ship a completed sample meeting reachable directly, so a visitor
can inspect the image beside its discussion, correct one passage and confirm one
commitment.

## 2. Capture health is web-only

`sourceHealth` and `isStalled` live in `packages/core/src/capture/live.ts` and are
read by the browser's capture screen. **The Mac app has no equivalent.** It
transcribes through `SourceTranscriber`/`SpeechAnalyzer`, a different mechanism,
so the functions do not port directly — but the failure they exist to catch does.
A Mac recognizer that dies mid-meeting is as silent there as it was in the browser
before this work, and the Mac is the recommended surface.

Not a port. It needs the same two questions answered against `SpeechAnalyzer`:
is this source being spoken into right now, and is anything coming back from it.

## 3. A joined commitment records its link and never shows it

`Item.related` is now written — `Notes.tsx` sets it when the reader confirms two
items were the same commitment — but **nothing reads it**. The type documents the
field as "Other item ids shown as related moments. Never asserted as causal", and
that display does not exist. A reader who joins two items sees one disappear into
Dismissed and no sign of what the survivor absorbed, beyond the extra passage in
its source panel.

## 4. "Not related" is recorded by overloading `userEdited`

Rejecting a suggested relation sets `userEdited: true` on the item, which stops
`relateItems` offering it again. It works, and it avoided a schema change on both
the TypeScript and Swift sides, but it says something broader than the reader
meant: the item is now treated as hand-corrected everywhere, including by
`refreshMeetingNotes`, which protects edited items from being replaced by a fresh
extraction. A rejected suggestion is not an edit.

The honest fix is a field, and it costs a mirrored change in `Models.swift`.

## 5. No signpost back from the transcript to the note you were checking

The source panel keeps its state, so returning to the Notes tab does put the
reader back where they were — but clicking "Open in transcript" lands them in the
transcript with nothing saying how to get back. The plan called for recording the
originating block and tab so the panel could offer a real way back; the state is
recorded and the affordance is not.

## 6. The draft is rewritten in full on every finalised line

`checkpoint` in `apps/web/src/views/Record.tsx` writes the entire events array
plus every image as a base64 data URL, once per transcript row. On a long meeting
with screenshots that is a large and growing IndexedDB put several times a minute.

Flagged during the capture work and deliberately not changed: the draft store had
just moved databases, and stacking a write-shape change on top of that would have
made a regression hard to attribute. **Measure it before changing it** — on a
sixty-minute meeting with a dozen screenshots.

## 7. The library deserialises everything on every mount

`readMeetingLibrary` reads every meeting in full — transcripts, notes, and every
image's base64 — and `NotesWorkspace` wraps the preferences, capture, meeting and
library routes, so this happens on nearly every navigation. Content search is free
because of it, which is why search was cheap to add; the cost is paid either way
and predates this work. A lightweight index would fix both. None exists.

The native path is the same with a heavier constant: `NotesBridge.listMeetings`
JSON-encodes every meeting, images included, across the JavaScriptCore bridge.

## 8. Per-source capture indicators were never seen in a live capture

`sourceHealth` is unit-tested across all five states, the rendering typechecks and
builds, and the recovery paths were driven in the running app. But the chips
themselves need `getDisplayMedia` and a real microphone, which could not be driven
from here. **The mute-one-source case — the exact case the old aggregate hid — has
not been watched happen.** Worth ten seconds with a real meeting before trusting
it.

## 9. English only, by decision rather than by oversight

Stated in the README's Requirements now, and not fixed. Recorded here so it is not
rediscovered as a bug: the constraint is not the `en-US` in three files, it is that
the notes are built by English grammar. Sentence splitting is ASCII-terminator
only, dates go through chrono-node's English parser, the word budgets that trim a
title and judge whether a reply answered a question count whitespace tokens, and
caption breaking, `substance()` and `scoring.ts` each carry English word lists.

A second language means writing its grammar. It is not a setting.

## 10. There is still no Mac download

`GetStarted.tsx` now tells the truth about this — the browser is the primary entry
and the steps describe building from source — but the funnel it describes is still
"install Xcode first", which the target user will not do.

What is needed is a tested prebuilt `.app` on GitHub Releases and
`VITE_MAC_DOWNLOAD_URL` pointed at it. Note the variable is compile-time inlined,
so it is set in Vercel project settings and availability changes need a redeploy.
No Apple Developer certificate, per the standing decision; the page and the README
both now explain the right-click-Open step that follows from that.

---

## Smaller, and genuinely minor

- **Tombstones are bounded at 200 and nothing tells the reader** when the oldest
  are dropped. The consequence is invisible — a very old deleted block could
  reappear in a regeneration preview, which is still shown before anything is
  applied — so this may be correct as it is.
- **`Onboarding.tsx` is unreachable dead code**, retained when its routing was
  removed. Deleting it was always a separate cleanup.
- **`apps/mac/Resources/excerpt-engine.js` is gitignored**, so a fresh checkout
  must run `pnpm --filter @excerpt/core build:engine` before `build.sh` will
  assemble the app. Working as designed; noted because it surprises people.
