# Desktop implementation handoff — Phase 7 in progress

Updated September 25, 2026. Branch: `note-and-transcript-quality`. Phase 6 and its
post-review fixes are pushed in `9115b32`. Phase 7's measured first pass is
committed locally as `892a6c6` (not pushed). The second-pass indexing, asset,
bridge, regression, and measurement work is uncommitted on top. Preserve this work, later local changes,
checkpoint history, synthetic fixtures, and unrelated files.
Do not read or alter production meeting data, signing settings, or permissions.

## Status and continuation

Phases 0–5 are complete at their automated gates. Phase 6 is `implemented /
acceptance pending`: its automated gate passes, but the real Mac app UI was not
exercised. Phase 7 is `in progress`, not through its storage/performance gate. Full
Xcode is available at `/Applications/Xcode.app/Contents/Developer`. The previously
blocked Phase 4 Swift gate passed here: **167 tests in 24 suites**. Its existing
JavaScript, typecheck, resource, token, and desktop-boundary checks were already
recorded in the pushed checkpoint. Real microphone, focus, fullscreen, multiple
display, sharing, long-session, accessibility, and signed-package acceptance
remain Phase 8 work; no automated result is presented as hardware acceptance.

The Phase 6 prompts are historical assignments. Continue Phase 7 from
`DESKTOP-PHASE-7-MEASUREMENTS.md` and the plan's Phase 7 gate; inspect `git status`
and the full diff, including untracked files. Do not reset, stash, or reconstruct
the migration.

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
- **Still pending (Phase 8):** VoiceOver/Full Keyboard Access and hardware
  capture. The Phase 6 synthetic layout check ran in Chromium; a later Phase 7
  fixture run exercised real WKWebView title/note/caption edits and an HTML save
  panel, but not full accessibility or hardware acceptance.
- **Next:** Continue Phase 7's measured storage work below. Carry the Phase 6
  real-app UI/accessibility checks above into Phase 8 acceptance.

## Phase 7 second pass and exact next step

- The first-pass projection/search/debounce and comparison fast path are in
  `892a6c6`, one local commit ahead of origin. Its full inline meeting was about
  29.6 MB and the old full-library bridge response about 30.5 MB; the projected
  library response remains 19 KB.
- The second pass persists compact validated library/search sidecars and
  content-addressed versioned image assets. It reads legacy inline data URLs,
  extracts only when an individual meeting is saved, verifies assets before
  atomic metadata replacement, and keeps recoverable draft/image checkpoints.
  Missing assets fail reads and retain recovery journals, not silently omit
  images. Full meeting and index
  caches are bounded. No whole-library migration runs at launch.
- Applied editor mutations now return a compact acknowledgment after durability;
  known images are rehydrated in the editor, with a full reload fallback for an
  unknown image. No duplicate editor-origin meeting event is published. Library
  rename returns only a small row, with no full meeting crossing the bridge.
- In the isolated benchmark, warm native library response was about 6.7 ms,
  native search 7.8 ms, and title/caption/note mutations about 8 ms. A title
  edit atomically replaced 163 KB instead of 29.6 MB. Twenty sequential title
  mutations averaged 8.0 ms (max 8.7 ms). With 30 distinct valid PNGs, initial
  extraction took 68.3 ms and the next title edit 5.8 ms. Details, repeated
  search RSS samples, the command, and limitations are in
  `DESKTOP-PHASE-7-MEASUREMENTS.md`.
- **September 25 live fixture smoke:** a separately identified debug app opened
  the 100-meeting synthetic library in WKWebView, searched an edited caption,
  edited title/note/caption, showed saved feedback, reopened with all edits, and
  used the native save panel to write a 28 MB HTML export containing 30 embedded
  images. The fixture root and app are under `/private/tmp` and remain available;
  exact paths and limitations are in `DESKTOP-PHASE-7-MEASUREMENTS.md`. The normal
  Excerpt store, settings, and signing were not touched.
- **September 25 public-video capture smoke:** after the user enabled Screen &
  System Audio Recording for the separate fixture app and it was relaunched, a
  short public YouTube meeting played in Arc. The live transcript populated;
  quitting finalized a 4m16s meeting with 14 final transcript events, and the
  saved meeting reopened from the isolated library. On-device note generation
  subsequently reached `ready`. Three events were marked `you`; microphone
  attribution was not validated. The floating caption overlay was not
  independently checked. See the measurement note for evidence and limits.
- **September 25 full-journey fixture run:** Preferences, live note entry and
  saved feedback, live image import/caption, normal End shortcut, saved-meeting
  reopen after cold relaunch, caption search, transcript correction, extracted
  next-step editing/completion, source passage, and native HTML export rendered
  from a local `file:` page were exercised. That run found a **blocking persistence
  defect**: one manually entered live paragraph was duplicated at finish with the
  same block ID in both saved JSON and exported HTML. The current worktree fixes
  the double-composition cause by reconciling durable block identity before source
  evidence and enforcing unique output IDs; focused TypeScript and native
  provider-failure regressions pass. The live fixture retest is still pending.
  The microphone warned about speaker playback bleed, so this run is not evidence
  of transcript quality. Native region capture also failed its UX check: with Arc focused on
  the local test page, ⌘⇧S brought Excerpt in front of the region selector;
  the user cancelled rather than capture the wrong window. An earlier picker
  cancellation correctly added no image. Since that run, the implementation
  has been changed to hide Excerpt's windows during its own picker and restore
  prior focus afterward; visual re-verification is still pending. The user also
  clarified that the desired normal flow is macOS's ⌘⇧4/⌘⇧5 shortcuts, so
  Excerpt now imports newly saved, screenshot-marked files from the configured
  screenshot folder while a meeting is live. Clipboard-only captures are not
  imported. See the
  measurement note for IDs, evidence, and limits.
- **Still unresolved:** rerun the fixed live-paragraph case in the signed fixture;
  visually verify both native screenshot routes with a stable fixture identity;
  keystroke-to-paint, caption presentation, confirmed-save
  latency, warm library paint, and repeated-meeting memory under GUI load need
  actual instrumentation. Computer-use call durations are not app timings. A
  short public-video capture now works, but network-isolated browser rendering and
  longer capture under hardware load are untested. Next, instrument the
  running isolated fixture for Phase 7 targets, then address any misses. Phase 8
  hardware/accessibility/signing remains separate; do not mark Phase 7 complete.

## Working tree

Baseline `1512caf` is pushed to `origin/note-and-transcript-quality`. The current
working tree contains the live-paragraph identity fix, its TypeScript/native
regressions, and these handoff updates. Generated
engine/editor resources were rebuilt from this source and remain ignored outputs.
Check `git status` before continuing; later edits belong to their author.

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
- After the Phase 7 first pass (September 23, 2026): `pnpm exec turbo test
  --force` **216 core + 39 editor passed**; `pnpm typecheck`, engine/editor
  resource builds, clean editor build, caption-token sync, `git diff --check`,
  and the desktop-boundary audit passed. Full `swift test` passed **175 tests in
  27 suites**; the opt-in Phase 7 measurement was also run separately and passed.
  Native tests verify the small library/search bridge payload and full-image
  reopen; editor tests verify search, failures, rename preservation, and that
  unchanged data URLs are not serialized for document-only mutation comparison.
- After the Phase 7 second pass (September 23, 2026): `pnpm exec turbo test
  --force` passed **217 core + 43 editor**; `pnpm typecheck`, engine/editor
  resource builds, and full `swift test` passed **186 tests in 27 suites**.
  The opt-in 30-distinct-PNG measurement passed separately. Caption-token sync,
  `git diff --check`, and the desktop-boundary audit passed; the latter found
  only retained explanatory comments and test-host wording.
- After the September 25 fixture-launch addition: the opt-in Phase 7 metrics
  test seeded the persistent synthetic-only root and passed; fresh engine/editor
  resources built; full `swift test` passed **186 tests in 27 suites** (conditional
  real-speech/model tests skipped); the debug fixture bundle was ad-hoc signed
  under a separate ID, verified, launched, and exercised in real WKWebView.
  `git diff --check` passed. These checks do not establish the Phase 7 latency
  targets or Phase 8 hardware acceptance.

The native lifecycle test ends a synthetic meeting with two images, then checks the
durable document before optional enhancement finishes. Shared tests cover text-only,
screenshots-only, no-content, two captures in one discussion, a later return to the
same subject, a capture between topics, no nearby speech, unknown-time import,
corrected anchor, manual placement/caption/deletion, and export wording. Native
tests cover later enhancement retaining captures, source correction cancelling
stale work, and duplicate job coalescing. The editor bridge test checks durable
image bytes, caption, anchor, and document order.

No browser databases, Keychain entries, production Excerpt
permissions, signing identity, or external hosting were touched. The user enabled
recording permission for the separate fixture app; the app was not launched
against user storage. Its public-video captures remain under the marked
`/private/tmp` fixture root. Generated resources are ignored outputs and must be
rebuilt after source changes. The stable signing identity remains unavailable,
so signed packaging is still a Phase 8 constraint.
