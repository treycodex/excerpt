# Phase 4 in-progress transfer handoff

> **Checkpoint status (September 22, 2026):** Phases 0–3 are complete. Phase 4
> has been started but is not complete and must not be marked complete from this
> checkpoint. The repository is being committed and pushed so it can be cloned on a
> new device. Preserve this exact history; do not reconstruct the earlier uncommitted
> workspace move.

## Ready-to-paste prompt

Continue the desktop-only Excerpt implementation in `/Users/trey/Build Games/excerpt`.

Read first, in order:

1. `DESKTOP-IMPLEMENTATION-PLAN.md` — authoritative scope, phase order, contracts, gates, and execution ledger.
2. `DESKTOP-REVIEW.md` — defect evidence and product rationale.
3. `DESKTOP-HANDOFF.md` — completed Phase 0–3 state, checks, risks, and this Phase 4 starting point.
4. Any repository instructions, then `git status` and all diffs.

Phases 0–3 are complete. Phase 4 is partially implemented in the current commit.
Continue and finish **Phase 4 only: simplify setup and everyday meeting controls**.
Preserve all existing work, synthetic fixtures, native data compatibility, generated
resources, and unrelated user files. Do not reset, stash, reconstruct, or read/delete
production meeting data. Do not start Phase 5.

First review the partial Phase 4 diff and its tests. Do not assume it is final merely
because it compiles. The current checkpoint added:

- typed `DesktopSettings`, caption, microphone, display, and shortcut contracts in
  TypeScript and Swift;
- native microphone discovery/selection persistence using stable device IDs and
  ScreenCaptureKit `microphoneCaptureDeviceID` wiring;
- native caption display persistence with fallback to the main display when the
  chosen display is disconnected;
- native-to-editor settings events and bridge calls;
- an initial `MeetingCommandCoordinator` shared by library/menu/global shortcut;
- global Start/End and captions shortcuts, contextual Catch up/Capture shortcuts,
  menu-visible registration availability, and removal of duplicate menu equivalents;
- a quieter primary menu, with looks, displays, setup, folders, diagnostics, and
  shortcut status under Settings & Help;
- Start no longer explicitly opens live notes and hides Excerpt after a successful
  coordinated start; explicit Open live notes and completion-open behavior remain.

Known incomplete work that must be finished before the Phase 4 gate:

1. Add the shared `MicrophoneController` to setup and implement the short native input
   selection/health check after permissions/model readiness. Keep Cinema as default;
   make look selection optional rather than setup's first required choice.
2. Render and mutate caption, display, microphone, and shortcut-conflict state in the
   bundled editor Preferences using only the new bridge. Subscribe to
   `excerpt:desktop-settings`; do not add local storage.
3. Add production-boundary native/editor tests for settings parity and relaunch,
   selected/missing microphones, one coordinated Start with no forced notes,
   explicit Open live notes, shortcut conflicts/contextual registration/no double
   fire, display movement/fallback, and legacy `processing: "demo"` compatibility.
4. Replace deprecated `AVCaptureDevice.devices(for:)` with the supported discovery
   session API, and review main-actor/sendability behavior around the microphone
   selection closure.
5. Review the initial command/focus policy and shortcut/menu implementations for race
   and UI edge cases. Verify the editor-originated start receives a useful error when
   permissions or the selected microphone block capture.
6. Rebuild engine/editor/native resources from source and run the complete Phase 4
   gate before updating the ledger to complete. Manual real-device/display/fullscreen/
   sharing/signed-package acceptance remains Phase 8.

Make native state the single authority for caption settings. The menu, setup, and bundled editor must read and write the same persisted preset, size, position, enabled preference, and selected display. Do not restore WebView local-storage settings or create a second editor-owned caption authority. Keep the three existing looks only. Changes must update every active native surface and persist across relaunch.

Add microphone selection and health through the typed native/editor bridge. Enumerate supported native inputs using stable device identifiers, persist the selected choice, honor it during capture, and report a missing/disconnected selection clearly rather than silently changing attribution. Keep system audio plus selected microphone. Do not add browser device APIs, browser capture, calendar integrations, or a diagnostic workflow as the normal path.

Use one native coordinator for Start meeting across library, menu, and shortcuts. Starting must show captions according to the persisted enabled preference but return focus to the meeting; it must not force the live editor open. `Open live notes` remains explicit. Notes open automatically only when the meeting completes. Keep everyday controls limited to Start/End, captions, Capture moment, Catch up, and Open notes; move setup, folders, and diagnostics behind secondary settings/help paths.

Register advertised Start/End and caption shortcuts globally. Register Catch up/Capture only when relevant. Make shortcut-registration conflicts visible while retaining menu fallbacks, and prevent a shortcut/menu equivalent from firing twice. Add a simple display selector or “move captions to this display” action; handle disconnected displays and fullscreen transitions predictably without tracking every pointer movement. Keep the current capturable-overlay behavior honest and do not claim sharing exclusion without real supported-path testing.

Retain the Phase 3 desktop boundary: only library, meeting, and settings routes remain; production requires the native host; the fake host is explicit test/development-only; browser persistence/capture/demo/marketing implementations must not return. Preserve legacy persisted meeting decoding, including `processing: "demo"`, without creating new demo meetings.

Add production-boundary coverage for native caption settings parity/persistence, selected/missing microphone behavior, Start from library crossing the native coordinator without forcing notes open, explicit Open live notes, global shortcut registration/conflicts and no double fire, caption display movement/fallback, and legacy meeting compatibility. Use native seams/fakes rather than real permissions or devices for automated tests. Do not claim real audio, screen sharing, fullscreen, multi-display, or signed-package acceptance from tests; those remain Phase 8.

Update root/editor/native scripts and documentation only where Phase 4 behavior changes. Rebuild generated engine/editor resources from source; never hand-edit bundles or `CaptionTokens.generated.swift`. Run appropriate Phase 4 checks: forced Turbo tests, full typecheck, engine build, editor-to-native-resource build, caption-token sync, Swift tests using task-specific `/private/tmp` caches, desktop forbidden-string audit, and `git diff --check`. Do not use ad-hoc signing or alter the signing identity.

After Phase 4, update the execution ledger in `DESKTOP-IMPLEMENTATION-PLAN.md` and this handoff with changed behavior/files, actual test counts/results, unresolved risks, blocked external checks, the exact Phase 5 next step, and the complete current worktree state. Stop before Phase 5.

## Completed through Phase 3

Base revision remains `ac7ef19`; all work is intentionally uncommitted. Phases 0–3
are complete. No production meeting data, browser databases, permissions, signing
settings, external hosting, or unrelated work was read, deleted, reset, or changed.

Phase 3 moved the retained React editor from `apps/web` to `apps/editor` and renamed
it to `@excerpt/editor`. The Mac app still bundles it at `apps/mac/Resources/notes`.
Only `#/meetings`, `#/m/:id`, and `#/preferences` are reachable; retired browser,
demo, marketing, onboarding, and capture hashes rewrite to the library. The wordmark
opens the library. Production requires the native bridge and visibly reports a missing
desktop host rather than touching browser persistence.

The bridge now has typed `startMeeting` and `openLiveNotes` operations. Library primary
controls invoke them; native handlers share the `AppDelegate` session coordinator rather
than constructing a second capture lifecycle. The fake native host remains under
`apps/editor/src/test` and is never imported by production code.

Removed: browser live capture/device enumeration/PiP/demo adapters and tests; browser
routes/views/styles; IndexedDB fallback and `idb-keyval`; standalone Vercel config;
marketing/demo media and product-shot/video tooling; demo seed/media script; and obsolete
browser-facing documentation. Preserved pure source health, caption/shared algorithms,
synthetic persisted fixtures, typed revision synchronization, the editable document,
library/settings, image handling, and legacy `processing: "demo"` decoding. Legacy values
are displayed as “Legacy,” not a product demo.

Root commands now include `build:engine`, `build:editor`, and `build:mac`. The native
build script regenerates engine and editor resources on every invocation, preventing an
existing resource directory from passing as fresh source output. `README.md` and
`apps/mac/DISTRIBUTION.md` describe the desktop-only product.

## Final Phase 3 checks

- `pnpm exec turbo test --force`: 199 core and 15 editor tests passed.
- `pnpm typecheck`: passed.
- `pnpm build:engine`, `pnpm build:editor`, and `pnpm --filter @excerpt/editor build`: passed; both the native notes resource and clean editor bundle were regenerated.
- `node apps/mac/tools/sync-caption-tokens.mjs --check`: passed.
- Source/generated-bundle forbidden-string audit found no browser capture, PiP,
  IndexedDB, or retired route implementation (route-test fixture strings excluded).
- `CLANG_MODULE_CACHE_PATH=/private/tmp/excerpt-phase3-clang swift test --disable-sandbox --cache-path /private/tmp/excerpt-phase3-swift-cache`: 156 tests in 22 suites passed; four conditional speech/model evaluations skipped.
- `git diff --check`: passed.

Swift emits the pre-existing `SetupModel.installSpeechModel` actor-isolation warning.
The real signed app/package and hardware acceptance were not run: the configured stable
signing identity is unavailable, and ad-hoc signing remains intentionally disallowed.
Those are Phase 8 constraints, not Phase 3 evidence.

## Exact Phase 4 next step

Clone/fetch the pushed `note-and-transcript-quality` branch, then read
`DESKTOP-IMPLEMENTATION-PLAN.md`, `DESKTOP-REVIEW.md`, and this handoff. Review the
partial Phase 4 diff before editing. Start by wiring the existing shared native
microphone/settings controllers into setup and editor Preferences, then add the missing
Phase 4 production-boundary tests listed below. Preserve Phases 0–3 and do not begin
Phase 5.

## Current worktree state

The transfer commit contains all intentional Phase 0–3 work and the partial Phase 4
checkpoint together. The `apps/web` removal and `apps/editor` addition may be displayed
as renames by Git clients; that is expected. Generated native engine/editor resources
are the last Phase 3 rebuild and must be regenerated after Phase 4 source work is
finished. Do not reset to `ac7ef19`, stash away the checkpoint, or reconstruct the
workspace move.

## September 22 Phase 4 partial checkpoint

This checkpoint intentionally stops mid-Phase 4 so the work can move to another
device. It is buildable, but the Phase 4 gate is not complete.

Files introduced for the partial Phase 4 work:

- `apps/mac/Sources/Excerpt/App/DesktopSettings.swift`
- `apps/mac/Sources/Excerpt/Capture/MicrophoneSettings.swift`
- `apps/mac/Sources/Excerpt/Meeting/MeetingCommandCoordinator.swift`

Existing files additionally changed for the partial work include the typed contracts,
native/editor bridge, notes-window event delivery, capture microphone configuration,
overlay settings/display behavior, shortcut registration, meeting health publication,
and AppDelegate menu/coordinator wiring. The editor fake host implements the new calls,
but the production Preferences view does not yet consume them.

Transfer-only verification performed after stopping implementation:

- `pnpm typecheck`: passed.
- `CLANG_MODULE_CACHE_PATH=/private/tmp/excerpt-phase4-handoff-clang swift test
  --disable-sandbox --cache-path /private/tmp/excerpt-phase4-handoff-swift-cache`:
  156 tests in 22 suites passed; four conditional speech/model evaluations skipped.
- `git diff --check`: passed before the documentation update and must be rerun by the
  continuing developer.

Warnings/risks:

- The pre-existing `SetupModel.installSpeechModel` actor-isolation warning remains.
- `NativeMicrophoneDiscovery` currently emits a deprecation warning for
  `AVCaptureDevice.devices(for:)`; replace it with `AVCaptureDevice.DiscoverySession`.
- No Phase 4-specific native or editor tests have been added yet.
- Setup and editor Preferences are not wired to the new settings model yet.
- Engine/editor generated resources were not rebuilt after this partial Phase 4 work.
- Turbo tests, forbidden-string audit, caption-token sync, and full Phase 4 build gate
  were not run for this partial checkpoint.
- Real audio, focus, fullscreen, multiple displays, sharing behavior, and signed package
  acceptance remain unverified Phase 8 work.

The Git branch at transfer is `note-and-transcript-quality`, with `origin` pointing to
`https://github.com/treycodex/excerpt.git`. Use the pushed checkpoint commit as the
source of truth on the new device. Do not return to baseline `ac7ef19` or recreate the
old uncommitted workspace move.
