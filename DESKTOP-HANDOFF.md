# Desktop implementation handoff — Phase 6 implemented, UI acceptance pending

Updated September 23, 2026. Branch: `note-and-transcript-quality`. The Phase 6
second pass and its post-review fixes are included in this checkpoint, on top of
`0d36b71` (Phase 5 and the first Phase 6 pass). Preserve any later local work,
checkpoint history, synthetic fixtures, and unrelated files.
Do not read or alter production meeting data, signing settings, or permissions.

## Status and continuation

Phases 0–5 are complete at their automated gates. Phase 6 is `implemented /
acceptance pending`: its automated gate passes, but the real Mac app UI was not
exercised. Full
Xcode is available at `/Applications/Xcode.app/Contents/Developer`. The previously
blocked Phase 4 Swift gate passed here: **167 tests in 24 suites**. Its existing
JavaScript, typecheck, resource, token, and desktop-boundary checks were already
recorded in the pushed checkpoint. Real microphone, focus, fullscreen, multiple
display, sharing, long-session, accessibility, and signed-package acceptance
remain Phase 8 work; no automated result is presented as hardware acceptance.

The copy-ready continuation prompts are `DESKTOP-PHASE-6-PROMPT.md` and
`DESKTOP-PHASE-6-CLAUDE-PROMPT.md`. Read one with
the plan and `DESKTOP-REVIEW.md`, then inspect `git status` and the full diff,
including untracked files. Do not reset, stash, or reconstruct the migration.

## Phase 6 behavior and exact next step

- **Document shape** (`apps/editor/src/views/Notes.tsx`, `notes.css`): title and
  save/generation state, then **Summary** (at most three lines from the document's
  own key points, using the reader's current block wording; unsupported or deleted
  points are skipped), **Next steps**, and the chronological editable **Notes**.
  Empty parts are hidden. The old recap and its duplicate image thumbnails were
  removed, so each image renders once with its saved caption, in document order.
  Pure helpers: `documentSummary` / `nextSteps` in `packages/core/src/notes/overview.ts`.
  Markdown/HTML exports include the same Summary; HTML marks completed items `Done`.
  Post-review regression coverage ensures a key point deduplicated against a
  topic bullet with a different ID follows that visible block's edits and
  deletion, including in exports.
- **One next-step identity:** next steps are the meeting's own action/deadline
  `Meeting.items`, rendered by id. Completing, assigning, and rewording use the
  same `update` → typed `setReviewItems` mutation as detailed review. There is no
  document copy and no schema change. Owners appear only when an item already has
  `assignee: 'you'`.
- **Reversible side trips:** the source panel, moment viewer, transcript, and
  detailed review record the reader's scroll position and focused control. Panels
  take focus and close with Escape; closing or going back restores both, including
  after a transcript correction. Corrections open inline under the corrected line
  and hand focus back to that line's Correct button.
- **Journey fixes:** an unreadable meeting shows a retryable "could not be opened"
  instead of "Reading…" forever, distinct from "No such meeting". The sidebar
  reports unreadable storage even when the Library supplies an empty failed read.
  Library rename/delete have per-meeting labels, delete
  confirmation focuses Keep, and search stays usable at the 720 px minimum width.
- **Accessibility:** muted text colours now compute to ≥4.5:1 on both paper
  tones. Save state stays visible at narrow widths. Reduced motion disables
  notebook transitions and smooth scrolling.
- **Not performed (Phase 8):** the real WKWebView app UI, VoiceOver/Full Keyboard
  Access, real keyboard text entry in the notes editor, native save panels, and
  hardware capture. The synthetic check ran in Chromium only.
- **Next:** Phase 7 — measure a synthetic 90-minute meeting with 30 screenshots
  and a 100-meeting library before changing storage. Add the Phase 6 real-app
  UI/accessibility checks above to the Phase 8 acceptance list.

## Working tree

The reviewed Phase 6 source, tests, and planning docs are part of this
checkpoint. Generated engine/editor resources were rebuilt from this source and
remain ignored outputs. Check `git status` before continuing; later edits belong
to their author.

## Phase 5 behavior

- End saves a transcript-based document immediately, with captured images included;
  optional provider enhancement runs afterward. A screenshot alone no longer sends
  generated wording through an approval step. The editor shows generation state and
  offers retry after a failed or stale run.
- The shared core composes automatic captures with the closest supported passage by
  event ID, then meeting-time overlap. It keeps chronological occurrences separate,
  including a subject that returns later. A capture without compatible text remains
  its own moment. The logic never describes image pixels or invents owners.
- Manual image moves, handwritten text, edited captions, and deleted blocks survive
  regeneration. Repeated requests for the same generation share one job; changed
  source input cancels stale wording; edits during generation retain the current
  document and expose the result as a suggestion.
- Live paste/drop/import uses the native meeting clock and saves immediately after
  image decoding. Finished-meeting imports need no guessed timestamp. The reader can
  later set a meeting-time anchor or move the image block. Original capture time,
  corrected anchor, and document order are stored separately.
- Caption edits update image metadata and document text together. Search and exports
  use the saved caption. Unknown meeting time is labelled honestly in notes and
  exports. The shared engine contract is version 3, so a stale bundle fails at load.
- A concise title is suggested from supported transcript text only when the default
  date title was not changed by the reader.

## Verification

- `pnpm exec turbo test --force`: **210 core + 23 editor tests passed**.
- `pnpm typecheck`: passed for core, types, and editor.
- `pnpm build:engine`, `pnpm build:editor`, and the clean editor build: passed;
  native engine/editor resources were regenerated from source.
- `node apps/mac/tools/sync-caption-tokens.mjs --check`: passed.
- `CLANG_MODULE_CACHE_PATH=/private/tmp/excerpt-phase5-clang swift test --package-path apps/mac --disable-sandbox --cache-path /private/tmp/excerpt-phase5-swift-cache`:
  **170 tests in 24 suites passed**. Conditional speech/model evaluations are not
  hardware acceptance.
- `git diff --check` and the source/generated-bundle desktop-boundary audit:
  passed; the latter found only historical comments, no browser capture, PiP,
  or IndexedDB implementation.
- After the first Phase 6 UI edits, the full suite passed again: **210 core +
  26 editor tests**, core/types/editor typechecks, **170 Swift tests in 24
  suites**, clean editor build and native resource rebuild, caption-token sync,
  desktop-boundary audit, and `git diff --check`.
- After the second Phase 6 pass and post-review fixes (September 23, 2026):
  `pnpm exec turbo test --force` **216 core + 36 editor passed**;
  `pnpm typecheck` passed;
  `pnpm build:engine`, `pnpm build:editor`, and the clean editor build passed;
  caption tokens in sync; `CLANG_MODULE_CACHE_PATH=/private/tmp/excerpt-phase6-clang
  swift test --package-path apps/mac --disable-sandbox --cache-path
  /private/tmp/excerpt-phase6-swift-cache` **173 tests in 25 suites passed**
  (four conditional speech/model evaluations skipped); `git diff --check`
  passed. Boundary audit: no browser capture, PiP, IndexedDB, or retired
  routes. Matches are two comments, legacy `processing: 'demo'` display, and
  React DOM's `disablePictureInPicture` attribute name.

The native lifecycle test ends a synthetic meeting with two images, then checks the
durable document before optional enhancement finishes. Shared tests cover text-only,
screenshots-only, no-content, two captures in one discussion, a later return to the
same subject, a capture between topics, no nearby speech, unknown-time import,
corrected anchor, manual placement/caption/deletion, and export wording. Native
tests cover later enhancement retaining captures, source correction cancelling
stale work, and duplicate job coalescing. The editor bridge test checks durable
image bytes, caption, anchor, and document order.

No real meeting data, browser databases, Keychain entries, permissions, signing
identity, or external hosting were touched. The app was not launched against user
storage. Generated resources are ignored outputs and must be rebuilt after source
changes. The stable signing identity remains unavailable, so signed packaging is
still a Phase 8 constraint.
