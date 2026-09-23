# Phase 4 implementation — full native acceptance pending

Updated September 23, 2026 for the destination Mac checkpoint.

Phases 0–3 remain complete. Phase 4 implementation and regression tests have been
extended from checkpoint `7da27151e64a651b628b0d3147b8c7a4b8e46fa6`, on branch
`note-and-transcript-quality`. **Do not mark Phase 4 complete yet.** The complete
Swift gate is blocked by this Mac's toolchain. The user explicitly asked to continue
without Xcode while they update macOS and install it. Phase 5 has not started.

## Continuation prompt

Continue Excerpt in `/Users/aidan/Documents/ChatGPT/excerpt`, branch
`note-and-transcript-quality`. Read `DESKTOP-IMPLEMENTATION-PLAN.md`,
`DESKTOP-REVIEW.md`, then this file. Preserve the checkpoint history and any subsequent local work. Do not reset, reconstruct the workspace move, or access production
meeting data. Finish the **Phase 4 verification gate only** before any Phase 5 work.

The destination device currently uses Command Line Tools at
`/Library/Developer/CommandLineTools` (Swift 6.3.3). `swift test` cannot compile the
existing `NotesSummarizer.swift`: the toolchain lacks the
`FoundationModelsMacros.GenerableMacro` / `GuideMacro` compiler plugin. Full Xcode
is not installed. Do not work around this by deleting generation code, changing
production behavior, or claiming a focused test run is the full app gate.

After the user finishes the OS/Xcode setup, use the full Xcode toolchain and rerun:

```sh
pnpm exec turbo test --force
pnpm typecheck
pnpm build:engine
pnpm build:editor
pnpm --filter @excerpt/editor build
node apps/mac/tools/sync-caption-tokens.mjs --check
CLANG_MODULE_CACHE_PATH=/private/tmp/excerpt-phase4-clang swift test --package-path apps/mac --disable-sandbox --cache-path /private/tmp/excerpt-phase4-swift-cache
git diff --check
```

Resolve any full native compilation/test failures, rerun the desktop boundary audit,
and record actual Swift counts before marking the Phase 4 gate complete. The new
bridge, setup, and microphone-disconnection lifecycle tests have **not** run through
the complete app target on this device. The installed toolchain also lacks the
`Testing` module, as confirmed by the focused test attempt. Real permissions/audio, focus, fullscreen,
displays, sharing, and signed packaging remain Phase 8 checks. Do not alter signing
identity or use ad-hoc signing.

## What changed in this continuation

- Setup now introduces the outcome with Cinema as the default, then permissions,
  speech readiness, and an optional 15-second native input check. It uses the shared
  microphone controller and the actual capture boundary, shows separate microphone
  and meeting-audio meters, discards buffers, and never creates a meeting. Back,
  Continue, window close, Start, and Quit release the check. Caption styling remains
  optional in Settings & Help and editor Settings.
- `DesktopPreferences.tsx` renders native caption enabled/look/size/position/display,
  selected microphone and health, missing-device/display notices, selection locks,
  and shortcut conflicts. It subscribes to `excerpt:desktop-settings`, preserves
  authoritative state after failed saves, and ignores stale acknowledgments/loads
  after a newer native event. No browser settings store was added.
- Caption writes now decode a `CaptionSettingsPatch`, matching TypeScript's partial
  editable-field payload. The checkpoint incorrectly decoded the full native
  snapshot, including metadata TypeScript did not send. Independent menu changes
  are retained when the editor changes another field.
- Microphone discovery uses `AVCaptureDevice.DiscoverySession` with `.microphone`
  and `.external`. Device notifications refresh open surfaces. A saved disconnected
  input does not silently fall back. Selection is locked while capture uses it;
  selected-device loss interrupts/saves the partial meeting with an actionable
  message. The capture selection closure is explicitly main-actor/sendable.
- The command coordinator coalesces concurrent starts and supports End while Start
  is pending. Cancelled starts do not invoke the focus callback. The library shows
  native permission/device/start errors instead of leaving an unhandled rejection.
  Start does not open notes; explicit Open live notes and automatic completion-open
  remain intact. Input-check and pending-start cleanup also participate in Quit.
- Display discovery is injectable for tests and observed even before the overlay
  first opens. It preserves the chosen display through disconnect/reconnect and
  resolves to an available display while disconnected.
- Global shortcuts report handler/registration failure, ignore foreign hotkey
  signatures, and unregister contextual actions. Their actual menu factory supplies
  empty key equivalents, retaining clickable fallbacks without duplicate keystrokes.
- Root typechecking now runs separate core and types tasks as well as the editor.
  React test-renderer dependencies were added for production component tests; the
  lockfile was updated. `.pnpm-store/` is ignored as local dependency output.

## Verification on this device

- Forced Turbo tests: **199 core + 22 editor passed**. Seven new editor component
  tests cover native settings, events, stale replies, save/load errors, input locks,
  conflicts, library actions/errors, and legacy `processing: "demo"` display.
- `pnpm typecheck`: **passed**, including core, types, and editor (three tasks).
- Engine build, editor-to-native-resource build, and clean editor production build:
  **passed**. Generated outputs remain ignored and were regenerated from source.
- Caption-token synchronization: **passed**.
- Production source and generated notes bundle audit: **no matches** for browser
  capture, IndexedDB, PiP, or retired record/session/demo route patterns. Test fixture
  files were excluded; legacy persisted enum decoding remains supported.
- Full Swift test gate: **blocked before tests** by missing Foundation Models macros.
  No previous device's 156-test result is claimed as current verification.
- Focused native controller module: **build-only command passed** against the actual production sources (30.62 seconds).
  Its test run then stopped at `no such module 'Testing'`: this Command Line Tools
  installation also lacks Swift Testing. **No Swift tests executed on this device.**
- All Swift source and test files passed `swiftc -frontend -parse` (syntax only).
- `git diff --check`: passed during verification; rerun after any edits.

A supplemental command, `python3 apps/mac/tools/test-phase4-controllers.py --build-only`, creates
an isolated temporary Swift package with symlinks to unchanged production controller
sources. Omitting `--build-only` also runs `Phase4DesktopSettingsTests.swift` when
Swift Testing is available. It does not stub Foundation Models,
run the app, open device capture, or touch meeting storage. It is deliberately not a
substitute for full `swift test`. `Phase4BridgeSettingsTests.swift`, the setup tests,
and the added lifecycle interruption test remain in the normal full app suite.

The focused native build retains the existing `SourceTranscriber` warning about
capturing `AVAudioPCMBuffer` in a sendable closure on this newer SDK. It was not
silenced or treated as a test result.

The environment's available pnpm is 11.19.0, Node is 24.19.0. The repository's existing
`packageManager: pnpm@12.3.4` declaration was preserved. Installation and builds used
the existing lockfile plus the two explicitly added React test dependencies.

## Worktree and next phase

This checkpoint builds on transferred commit `7da27151e64a651b628b0d3147b8c7a4b8e46fa6`
on `note-and-transcript-quality`. Use `git log -1` and `git status` to identify the
current revision and any subsequent local work. The checkpoint changes cover
README, native setup, capture/settings/coordinator/bridge/shortcuts/display handling, editor
Preferences and library feedback, shared contracts, tests/scripts, package manifests,
lockfile, this handoff, and the execution ledger. New source/test files are:

- `apps/editor/src/views/DesktopPreferences.tsx`
- `apps/editor/src/test/desktopSettings.test.tsx`
- `apps/mac/Sources/Excerpt/Setup/InputCheck.swift`
- `apps/mac/Tests/ExcerptTests/Phase4DesktopSettingsTests.swift`
- `apps/mac/Tests/ExcerptTests/Phase4BridgeSettingsTests.swift`
- `apps/mac/tools/test-phase4-controllers.py`
- `packages/types/tsconfig.json`

No production meetings, migration history, permissions, signing configuration, or
external hosting were read or modified. No app was launched against production storage.

**Immediate next step:** finish the full Phase 4 gate after macOS/Xcode installation.
**Only after that gate passes:** Phase 5 starts with generation lifecycle/input
freshness and automatic visual-note composition, preserving manual writing, image
placement, and deletions. That work is outside this continuation.
