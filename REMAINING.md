# Still owed

Rewritten 28 September 2026, after the move to a transcript-first Mac app: a
meeting ends as its transcript with screenshots in place, and notes are written
only when asked for. The browser capture, the web demo and the review screen are
gone, and so are the items that were about them. Nothing here is scheduled.

Each item says what is wrong, where, and — where it matters — why it was left.

---

## 1. ~~The library reads every meeting in full~~ — done

Library rows and search already came from small per-meeting index files (see
`DESKTOP-PHASE-7-MEASUREMENTS.md`). Two paths still opened whole meetings, and
were fixed 28 September 2026: rebuilding an index read and hashed every
screenshot, and launch loaded every meeting to find notes still being written.
Indexes now record that state (index version 3), and rebuilds skip image bytes.

Measured with `EXCERPT_LIBRARY_MEASURE=1` (20 meetings, 12 screenshots each,
three runs): cold rebuild 255 ms → 50–85 ms; launch scan 249 ms → 10–11 ms; warm
reopen unchanged at 9–14 ms. The first launch after upgrading pays one rebuild.

## 2. Capture health has never been watched during a real capture

`SourceHealthMonitor` is unit-tested over a simulated ten-minute stall and checked
against `packages/core/fixtures/source-health.json`, but the mute-one-source case —
the case the old aggregate hid — has not been watched happen in a real meeting.

The TypeScript copy in `packages/core/src/capture/health.ts` now has no caller:
browser capture is gone. It survives as the second implementation the shared
fixture is checked against. Delete it if that check stops being worth having.

## 3. English only, by decision rather than by oversight

Recorded so it is not rediscovered as a bug: the constraint is not the `en-US` in
a few files, it is that extraction and fallback notes are built from English
grammar. Sentence splitting is ASCII-terminator only, dates go through
chrono-node's English parser, and caption breaking and `substance()` carry English
word lists. A second language means writing its grammar. It is not a setting.

## 4. ~~There is still no Mac download~~ — done

Since 28 September 2026 the landing page and README link to `Excerpt.dmg` on the
latest GitHub release, and all three install surfaces (page, README, the DMG's
`Read me.txt`) explain **Open Anyway** in Privacy & Security — right-click Open no
longer bypasses Gatekeeper. Since 29 September there is also a Terminal install
(`install.sh`, on the site's `#/install` page) that never meets the prompt. Still
unsigned by Apple, per the standing decision; Developer ID and notarization would
remove the step for browser downloads. See `apps/mac/DISTRIBUTION.md`.

## 5. Extracted items outlive the screen that showed them

Decisions, actions, deadlines and questions are still extracted, but only when
notes are requested: decided decisions lead the local fallback notes. (A new
meeting's title comes from the transcript's key points, since End extracts
nothing.) Their
review state (`userEdited`, `dismissed`, `completed`, `unrelated`) can no longer be
set by anyone, but it stays in the model because older meetings carry it and
`refreshMeetingNotes` still respects it. The `setReviewItems` mutation is how
re-extracted items reach native storage after "Refresh excerpts".

---

## Smaller, and genuinely minor

- **Tombstones are bounded at 200 and nothing tells the reader** when the oldest
  are dropped. A very old deleted block could reappear in a regeneration preview,
  which is still shown before anything is applied — so this may be correct as it is.
- **`apps/mac/Resources/excerpt-engine.js` is gitignored**, so a fresh checkout
  must run `pnpm build:engine` before `build.sh` will assemble the app. Working as
  designed; noted because it surprises people.
