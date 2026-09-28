# Still owed

Rewritten 28 September 2026, after the move to a transcript-first Mac app: a
meeting ends as its transcript with screenshots in place, and notes are written
only when asked for. The browser capture, the web demo and the review screen are
gone, and so are the items that were about them. Nothing here is scheduled.

Each item says what is wrong, where, and — where it matters — why it was left.

---

## 1. The library reads every meeting in full

`NotesBridge.listMeetings` and `searchMeetings` load every stored meeting —
transcript, notes and every screenshot's bytes — to build a list row or a search
hit, and the sidebar asks for the library on nearly every navigation. The rows
themselves are small (`MeetingLibraryEntry`); the cost is in reading and decoding
the files to produce them.

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

## 4. There is still no Mac download

The landing page sends people to the source. What is needed is a tested prebuilt
`.app` on GitHub Releases, linked from the page. No Apple Developer certificate,
per the standing decision, so the page has to explain the right-click-Open step.

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
