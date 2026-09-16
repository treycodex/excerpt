# Still owed

What is left after the work on `note-and-transcript-quality` that closed the
engine review and opportunities 4–10 of the product-experience review. Written
16 September 2026, and struck through as items close. Nothing here is scheduled.

Open: 1, 6, 7, 8, 10, and the minor list. Closed: 2, 3, 4, 5. 9 is a decision
rather than a task.

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

## 2. ~~Capture health is web-only~~ — done, but never watched live

Closed 16 September 2026. The decision and its thresholds moved to
`packages/core/src/capture/health.ts`, mirrored in
`apps/mac/Sources/Excerpt/Capture/SourceHealth.swift`, and both are checked
against `packages/core/fixtures/source-health.json` the way the extraction engine
is. `SourceHealthMonitor` derives the signals from counters the Mac already kept
and ticks them every second while a meeting runs; only `stalled` and `failed`
reach the menu-bar line.

**What remains is item 8: none of this has been watched during a real capture**,
on either surface. The rule is checked twice over nine fixture cases and the
monitor over eight, but a live meeting with one source muted is still the thing
that would prove it.

## 3. ~~A joined commitment records its link and never shows it~~ — done

Closed 16 September 2026. A joined item now shows what it absorbed, and offers
"Separate again", which restores the absorbed item and removes the passages that
came from it — matched by source, so nothing is duplicated and nothing is lost.
The join was the one irreversible action in a product whose whole claim is that
every item can be corrected.

## 4. ~~"Not related" is recorded by overloading `userEdited`~~ — done

Closed 16 September 2026. `Item.unrelated` carries it, mirrored in
`Models.swift`, and is honoured in both directions — a rejection is a statement
about the pair, not about whichever of the two happened to be offered. Joining is
no longer recorded as an edit either.

Editing an item no longer suppresses its suggestions, which was the other half of
the conflation: fixing a typo in a title said nothing about whether the item was
the same commitment as another, and silenced the question for good.

## 5. ~~No signpost back from the transcript to the note you were checking~~ — done

Closed 16 September 2026. Opening a passage from the source panel now leaves a
way back at the top of the transcript, naming the note. The panel is still open
behind it, so returning puts the reader exactly where they were.

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

## 8. Capture health has never been watched during a real capture

**The one thing left on capture, and it applies to both surfaces now.**

The rule is checked twice against a shared fixture, the browser chips typecheck
and build, the Mac monitor is unit-tested over a simulated ten-minute stall, and
the recovery paths were driven in the running app. But the indicators themselves
need `getDisplayMedia` and a real microphone in the browser, and a real meeting on
the Mac, neither of which could be driven from here.

**The mute-one-source case — the exact case the old aggregate hid — has not been
watched happen.** Ten seconds with a real meeting, on each surface.

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
