# Desktop implementation handoff — Phase 6 in progress

Updated September 23, 2026. Branch: `note-and-transcript-quality`. The checked-out
base is pushed commit `42c5dbe` (completed Phase 4 implementation). Phase 5 and
the first Phase 6 changes are intentionally uncommitted in this worktree. Preserve
them, checkpoint history, synthetic fixtures, and unrelated files.
Do not read or alter production meeting data, signing settings, or permissions.

## Status and continuation

Phases 0–5 are complete at their automated gates; Phase 6 is in progress. Full
Xcode is available at `/Applications/Xcode.app/Contents/Developer`. The previously
blocked Phase 4 Swift gate passed here: **167 tests in 24 suites**. Its existing
JavaScript, typecheck, resource, token, and desktop-boundary checks were already
recorded in the pushed checkpoint. Real microphone, focus, fullscreen, multiple
display, sharing, long-session, accessibility, and signed-package acceptance
remain Phase 8 work; no automated result is presented as hardware acceptance.

The copy-ready continuation prompt is `DESKTOP-PHASE-6-PROMPT.md`. Read it with
the plan and `DESKTOP-REVIEW.md`, then inspect `git status` and the full diff,
including untracked files. Do not reset, stash, or reconstruct the migration.

## Phase 6 checkpoint and exact next step

- `apps/editor/src/views/Notes.tsx` and `notes.css`: the document is primary;
  transcript and detailed review are reversible secondary views. Export and
  rewrite actions are grouped; export cancellation is stated accurately; an
  accepted rewrite has guarded one-step undo. Source correction and existing
  review controls remain reachable.
- `Preferences.tsx`: extraction order and keywords are under Advanced; the
  provider choice now explains automatic post-meeting enhancement and cloud
  transcript/caption transfer. `Library.tsx` distinguishes unavailable storage
  and keeps a refused rename visible for retry. Editor component tests cover
  navigation, undo, storage failure, and refused rename.
- **Next implementation:** give next steps one `Meeting.items` identity across
  document and detailed review, then shape the default document into a concise
  supported summary, chronological moments, and short next steps. Follow with
  source-panel focus/return, keyboard/accessibility, and complete Phase 6 gate
  checks. Keep Phase 6 `in progress` until those pass. Real hardware, long-session,
  sharing, and signed-package checks remain Phase 8.

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
  desktop-boundary audit, and `git diff --check`. The complete Phase 6 product
  gate and real-app UI acceptance remain open.

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
