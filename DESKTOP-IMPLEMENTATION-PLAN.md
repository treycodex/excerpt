# Excerpt: desktop-only implementation plan

Prepared September 22, 2026. Baseline: `ac7ef19`.

Status: **Phases 0–5 complete at automated gates; Phase 6 implemented with real-app UI acceptance pending; Phase 7 in progress. Real-device and signed-package acceptance remain Phase 8.**

Source: [DESKTOP-REVIEW.md](</Users/trey/Build Games/excerpt/DESKTOP-REVIEW.md>). Phase 6 prompt: [DESKTOP-PHASE-6-PROMPT.md](</Users/trey/Build Games/excerpt/DESKTOP-PHASE-6-PROMPT.md>). Current handoff: [DESKTOP-HANDOFF.md](</Users/trey/Build Games/excerpt/DESKTOP-HANDOFF.md>).

This is the current implementation scope. Where older planning documents require a browser product, web demo, or competition funnel, this desktop-only direction supersedes them. Their technical measurements and saved-data constraints remain useful. Inspect the working tree before executing: it may have changed since this baseline.

## 1. Product contract

**Start a meeting. Read movie-style captions. Capture useful screens. End with one clear document that combines the visuals, conversation, and next steps.**

The shipped product is a Mac app. Its default experience must work without a browser, account, API key, or cloud summary service. Optional OpenAI note enhancement remains an advanced, explicit choice using the existing Keychain integration. English, macOS 26+, and Apple silicon remain the supported scope.

### Decisions already made for the implementer

| Area | Decision |
| --- | --- |
| Browser product | Remove live browser capture, browser library/persistence, browser onboarding, public interactive demo, and marketing routes from this repository's shipped application. |
| Notes implementation | Keep React/TypeScript inside the Mac app's WKWebView. Rename its workspace to `apps/editor` / `@excerpt/editor`; do not rewrite the editor in SwiftUI. |
| Shared logic | Keep extraction, transcript assembly helpers, document composition, evidence, exports, schemas, tests, and caption tokens used by the Mac app. |
| Website | No replacement website is part of this work. Remove repository web deployment configuration. Do not delete or redeploy an existing external hosting project as part of local implementation. |
| Main interaction | Start leaves attention on the meeting. Cinema captions default on. Open live notes is an explicit secondary action. End opens saved notes automatically. |
| Visual collection | Explicit region capture and image paste/drop/import. No automatic screen collection, OCR, or interpretation of image pixels. |
| Final output | One editable document: brief summary, topic/moment sections with images, next steps, and expandable transcript/source access. |
| Review | Optional detailed review remains reachable, but is removed from the default top-level tab bar. Preserve existing confirmations, corrections, and task state. |
| Caption settings | One native authority shared by settings, menu, setup, and overlay. Three existing looks; no theme expansion. |
| Audio | Native system audio plus selected microphone. Expose input selection and health without forcing a diagnostic workflow. |
| Speakers | Keep honest You/Others attribution. Do not invent participant names or promise diarization. |
| Existing data | Preserve native meetings, journals, edits, image positions, and legacy enum values. Never delete browser databases or user files while removing browser source code. |
| Distribution | Produce and verify a local build/package. Preserve the stable development signing identity. Developer ID notarization and public release are separate readiness conditions if credentials/authorization are unavailable. |

Out of scope: Windows/Linux ports, calendar/meeting-service integrations, shared workspaces, cross-meeting chat, multilingual extraction, task-management expansion, retained meeting audio, new model providers, and a replacement landing site.

## 2. Target architecture and removal boundary

Proposed layout:

```text
apps/mac                 native capture, captions, setup, lifecycle, files, providers
apps/editor              bundled desktop document/library/settings UI
packages/core            pure extraction, composition, evidence, search, export
packages/types           JSON contracts mirrored in Swift
packages/ui              retained editor components and caption/design tokens
```

Native capture owns audio, transcript arrival, the session clock, and capture state. Native storage owns durable state. The editor submits explicit changes and renders acknowledged snapshots. Caption updates remain entirely native. The embedded editor must not quietly create an alternative browser database when its bridge is absent.

### Keep, move, and remove

| Current source | Required treatment |
| --- | --- |
| [apps/mac](</Users/trey/Build Games/excerpt/apps/mac>) | Keep and improve. Preserve bundle identity and the current application-support location. |
| [Notes.tsx](</Users/trey/Build Games/excerpt/apps/web/src/views/Notes.tsx>), [NotesDocument.tsx](</Users/trey/Build Games/excerpt/apps/web/src/views/NotesDocument.tsx>), [NotesWorkspace.tsx](</Users/trey/Build Games/excerpt/apps/web/src/views/NotesWorkspace.tsx>), [Library.tsx](</Users/trey/Build Games/excerpt/apps/web/src/views/Library.tsx>), [Preferences.tsx](</Users/trey/Build Games/excerpt/apps/web/src/views/Preferences.tsx>) | Move into `apps/editor`, simplify, and connect to the native bridge. Retain required image normalization, error boundary, fonts, styles, and wordmark. |
| [App.tsx](</Users/trey/Build Games/excerpt/apps/web/src/App.tsx>), [router.ts](</Users/trey/Build Games/excerpt/apps/web/src/router.ts>) | Replace mixed web routing with desktop library, meeting, and settings routes. Unknown/retired routes return to the library. |
| [apps/web/src/views](</Users/trey/Build Games/excerpt/apps/web/src/views>) browser views | Remove `Record`, `Session`, `CallFrame`, browser `CatchUp`, `Landing`, `LandingLegacy`, `GetStarted`, `Onboarding`, and their exclusively used styles. Native catch-up stays. |
| [pip.ts](</Users/trey/Build Games/excerpt/apps/web/src/pip.ts>), [ambience.ts](</Users/trey/Build Games/excerpt/apps/web/src/ambience.ts>), [demo/script.ts](</Users/trey/Build Games/excerpt/apps/web/src/demo/script.ts>) | Remove production browser playback/PiP/demo code. Move any useful synthetic transcript into test fixtures before deleting its source. |
| [packages/core/src/capture](</Users/trey/Build Games/excerpt/packages/core/src/capture>) | Remove browser `live`, `devices`, and demo adapters plus tests only relevant to those adapters. Retain/move pure source-health logic and its parity tests. Audit useful normalization assertions before removing `live.test.ts`. |
| [store/meetings.ts](</Users/trey/Build Games/excerpt/packages/core/src/store/meetings.ts>), [store/preferences.ts](</Users/trey/Build Games/excerpt/packages/core/src/store/preferences.ts>), [store/bridge.ts](</Users/trey/Build Games/excerpt/packages/core/src/store/bridge.ts>) | Replace IndexedDB fallback with typed native clients. Remove browser capture-draft storage and `idb-keyval` when no consumers remain. Propagate real failures. |
| [packages/core/src/index.ts](</Users/trey/Build Games/excerpt/packages/core/src/index.ts>), [packages/types/src/index.ts](</Users/trey/Build Games/excerpt/packages/types/src/index.ts>) | Remove dead capture exports/interfaces, retain legacy persisted field/enum decoding, and introduce explicit native contracts. |
| [packages/ui](</Users/trey/Build Games/excerpt/packages/ui>) | Keep tokens and the editor's `Strip` and `Frame` consumers until deliberately replaced. Do not delete the package just because it also served web UI. |
| [public/media](</Users/trey/Build Games/excerpt/apps/web/public/media>), [web/tools](</Users/trey/Build Games/excerpt/apps/web/tools>), [seed-demo-meeting.mjs](</Users/trey/Build Games/excerpt/packages/core/tools/seed-demo-meeting.mjs>) | Remove demo videos, marketing-only images, and obsolete render/seed tools after dependency inspection. Move the brand generator if retained. Native setup currently references `editorial-hero.jpg`; retain it with its credit or replace that setup preview before removing it. |
| [vercel.json](</Users/trey/Build Games/excerpt/vercel.json>) | Remove tracked web deployment configuration. Leave external hosting and local credential/link metadata alone. |
| [build.sh](</Users/trey/Build Games/excerpt/apps/mac/build.sh>), [package-dmg.sh](</Users/trey/Build Games/excerpt/apps/mac/package-dmg.sh>), [package.json](</Users/trey/Build Games/excerpt/package.json>), [pnpm-lock.yaml](</Users/trey/Build Games/excerpt/pnpm-lock.yaml>) | Update workspace references, editor build, icon tooling, packaging text, and lockfile together. Preserve the generated `Resources/notes` bundle location to minimize native churn. |

Development previews are allowed only as clearly marked synthetic editor harnesses. They must be excluded from production, cannot capture real audio, and cannot silently persist real meetings in browser storage. Static self-contained HTML exports remain supported; they are documents, not a browser product.

## 3. Data and bridge rules

Define these rules before implementing UI changes. Suggested names below can change; the semantics cannot.

### Durable meeting state

- Add a schema version and a native-owned monotonically increasing meeting revision. It must continue across live-to-finished transitions; do not reuse missing `draftRevision` as `-1` to decide whether a finished document is newer.
- Keep a separate source revision for transcript corrections. A revision of document writing is not a transcript revision.
- Return acknowledged revision plus authoritative state for every accepted mutation. “Saved” means the relevant checkpoint/file operation succeeded.
- Prefer typed operations for title, document edits, image additions/metadata, transcript corrections, and review-item edits. Include operation ID and base revision. Do not preserve the current unrestricted stale whole-meeting overwrite protocol.
- During capture, accept editor-owned changes while preserving newer speech/images. On completion, accept all supported edit types. Editing finished meeting A while recording B must use A's storage path.
- A stale base revision must be safely rebased for independent fields/blocks or returned as a conflict with local writing preserved for retry. Never blindly resend a stale whole snapshot over newer state.
- Derive live status from the native session, not from missing `endedAt`: recovered legacy meetings may have no end time without being active.
- Retain compatibility with native files containing `cloud`/`demo` processing values, missing revisions, old note sections, existing data URLs, or missing image metadata. Removing creation paths does not authorize making old data unreadable.

### Generation lifecycle

- Represent queued/running/ready/failed/cancelled state in snapshots that the notes window can render. A missing model yields immediate useful extractive notes.
- Jobs are identified by meeting, generation ID, source revision, and a fingerprint/version of other supplied inputs such as screenshot captions. Reject outdated results and superseded jobs.
- Reload/merge against current durable state before applying. Preserve user wording, deletions, manual image positions, title edits, and item state.
- If the user did not edit generated text, update it automatically. If a replacement conflicts with writing, offer a secondary suggestion while keeping the current document useful.
- Deleting a meeting must invalidate its running generation and queued writes so an asynchronous completion cannot recreate it.
- Quit does not wait for optional enhancement. Cancel it safely and mark unfinished generation recoverably; do not automatically make paid requests on relaunch. An explicit retry remains available.
- Preserve one bounded prior generated version for Undo rewrite, including protection against resurrecting deliberately deleted blocks.

### Captured moments

- Preserve capture timestamp independently from document placement. Add explicit automatic/manual placement metadata; editing a caption must not itself make image position manual.
- Track whether an imported image has a known meeting time. Use an additive unknown-time marker if practical so legacy numeric `at` readers remain compatible. Unknown images must not acquire a fabricated `0:00` claim or a false source passage.
- Keep the original immutable capture timestamp; later time correction is a separate anchor change. Moving a block changes neither.
- If older image placement is ambiguous, preserve it rather than automatically rearranging saved documents. Newly captured moments can be automatically composed until the user moves them.
- One visible caption value must feed the document, search, export, and provider context; resolve today's block-text/image-caption duplication deliberately.

### Native interface additions

| Capability | Required behavior |
| --- | --- |
| Start/end/open live meeting | All entry points invoke one native coordinator; duplicate requests cannot create duplicate sessions. |
| Session snapshot/subscription | State, active meeting ID, elapsed time, source health, persistence health, generation status as relevant. |
| Caption settings | Read/write native preset, size, position, enabled preference, and selected display; changes broadcast to all surfaces. |
| Microphone settings | List devices, get/set preferred stable device ID, report missing device; persisted selection must be honored by capture. |
| Meeting mutation | Typed operation, base revision, operation ID, durable acknowledgment, useful conflict/error result. |
| Add image | Normalize once, native meeting-time placement for live imports, return durable image and document state. |
| Export | Resolve only after native save completion; distinguish saved, cancelled, and failed. |
| Delete | Propagate failures, stop outstanding work, update library only after confirmed deletion. |

Validate IDs, payload shapes, enum values, and local resource paths at the bridge. Keep external navigation outside the privileged notes view. If image resources move to a custom scheme, validate the exact origin and path containment rather than a sibling-prefix check.

## 4. Phases and gates

Run phases sequentially. Complete each gate before marking it done. Do not request permission between ordinary local phases. Keep a small focused change set per phase and update the execution ledger. If a prerequisite is unavailable, complete independent work and record precisely which acceptance checks remain unverified.

| Phase | User-visible outcome | Depends on |
| --- | --- | --- |
| 0 | A reproducible baseline and migration fixtures exist | — |
| 1 | Notes, corrections, images, and actions save reliably | 0 |
| 2 | Starting, stopping, quitting, and interruptions preserve the meeting | 1 |
| 3 | Only the desktop product remains buildable/shippable | 2 |
| 4 | Setup and everyday meeting controls are simple and consistent | 3 |
| 5 | Ending a meeting produces automatically composed visual notes | 1–4 |
| 6 | Notes, library, and settings present a quiet, coherent desktop experience | 4–5 |
| 7 | Long meetings and image-heavy libraries remain responsive | 5–6 |
| 8 | The packaged app passes real desktop acceptance checks | 0–7 |

### Phase 0 — Establish a reproducible baseline

**Work**

1. Inspect status/diffs, instructions, available signing identity, generated-resource paths, and test commands. Preserve unrelated work and the review document.
2. Record fresh automated results. Earlier review results were 214 core + 6 web tests, typecheck passing, and a Swift run reporting 134 tests. Counts are not contractual: browser-only tests will be removed and integration coverage added.
3. Create synthetic legacy/native meeting fixtures: text-only, screenshot-only, handwritten, corrected, reviewed, deleted blocks, legacy sections, interrupted draft, and multiple finished meetings. Never copy private meeting content into fixtures.
4. Add a testable seam around session capture/provider dependencies and native storage where necessary. Component/bridge tests need an explicitly injected fake native host, not the browser persistence fallback.
5. Record the reviewed defects as regression scenarios and inventory production browser dependencies before removal.

**Primary surfaces:** [native tests](</Users/trey/Build Games/excerpt/apps/mac/Tests/ExcerptTests>), [core fixtures](</Users/trey/Build Games/excerpt/packages/core/fixtures>), [editor sources](</Users/trey/Build Games/excerpt/apps/web/src>).

**Gate:** baseline results and fixtures are recorded; production data was not modified; required resources can be generated from source. Do not confuse conditional speech-fixture tests with measured live speech accuracy.

### Phase 1 — Fix persistence and live-to-finished synchronization

**Work**

1. Implement the revision/mutation contract and compatible decoding in TypeScript and Swift together.
2. Remove `lastSaved` ownership of finished-meeting editor writes. Route only the currently active draft through capture merging.
3. Make transcript corrections, review item changes, images, source revisions, suggestions, and document edits durable in completed meetings.
4. Replace React's `draftRevision ?? -1` merge with acknowledgment-aware synchronization that accepts new finished documents while retaining unsaved local work.
5. Queue/coalesce edits safely; flush on navigation/window close or persist through an explicit native acknowledgment. Closing a window cannot drop the last keystrokes silently.
6. Fix error propagation through both layers: native export/delete and TypeScript clients. The current `deleteMeeting` wrapper also swallows native errors and must change.
7. Surface journal/checkpoint failure as degraded recovery health. Do not claim text is safely stored merely because it is in memory.
8. Prevent generation or queued editor saves from reviving a deleted meeting. Reload library state after actual durable changes.

**Primary surfaces:** [MeetingSession.swift](</Users/trey/Build Games/excerpt/apps/mac/Sources/Excerpt/Meeting/MeetingSession.swift>), [MeetingStore.swift](</Users/trey/Build Games/excerpt/apps/mac/Sources/Excerpt/Storage/MeetingStore.swift>), [NotesBridge.swift](</Users/trey/Build Games/excerpt/apps/mac/Sources/Excerpt/Notes/NotesBridge.swift>), [Models.swift](</Users/trey/Build Games/excerpt/apps/mac/Sources/Excerpt/Core/Models.swift>), [Notes.tsx](</Users/trey/Build Games/excerpt/apps/web/src/views/Notes.tsx>), [App.tsx](</Users/trey/Build Games/excerpt/apps/web/src/App.tsx>), shared store clients/types.

**Required tests and outcome**

- Finish A, correct transcript, confirm/dismiss/change an item, import an image, edit its caption, reload: every change survives and every image block resolves.
- Start B, edit A: A saves independently; B continues capturing.
- Native speech/image update between keystrokes: both capture data and writing survive.
- Automatic summary reaches an untouched open draft: text appears without reload.
- Out-of-order acknowledgments and updates do not revert newer writing.
- Storage/export failure reports failure, save-panel cancellation reports cancellation, failed deletion retains the entry.
- Delete while enhancement runs: no resurrection.
- Legacy fixtures round-trip without losing data.

**Gate:** all above have automated coverage at the actual native/store and editor/bridge boundaries, not just tests of copied merge formulas.

### Phase 2 — Make the session lifecycle reliable

**Work**

1. Centralize idle → starting → listening → finishing → completed/interrupted transitions. Guard requests with a session identity/token so late startup completion cannot restart an already ended session.
2. Clean up partially started transcribers and capture resources when any startup step fails. Test repeated starts and back-to-back meetings.
3. Replace the termination semaphore with `applicationShouldTerminate` deferred termination and an asynchronous completion reply. Drain transcript finalization and required saves; optional notes enhancement must not hold quit open.
4. Persist finish reason and capture error. One coordinator opens the resulting notes after manual stop and interruption. Never open the previous `lastSaved` meeting when the new save failed.
5. Hide the overlay on finish and recompute Dock presence. Persist the user's caption-enabled preference separately from actual window visibility.
6. Surface stalled/failed audio and persistence warnings without treating silence as an error. Clear recovery notices accurately. The headphone suggestion must be based on a meaningful live signal; the existing post-start check of a stop-time counter cannot provide it.
7. Define retry/recovery for failed saves and unfinished generation. Recovery remains useful even when there is only handwriting or a screenshot.
8. Handle screenshot capture during end/quit: either finish the pending capture before saving or cancel it explicitly; never attach a late result to another meeting. Avoid indefinite waits for an open region picker.

**Primary surfaces:** [AppDelegate.swift](</Users/trey/Build Games/excerpt/apps/mac/Sources/Excerpt/App/AppDelegate.swift>), [MeetingSession.swift](</Users/trey/Build Games/excerpt/apps/mac/Sources/Excerpt/Meeting/MeetingSession.swift>), [CaptureEngine.swift](</Users/trey/Build Games/excerpt/apps/mac/Sources/Excerpt/Capture/CaptureEngine.swift>), [SourceTranscriber.swift](</Users/trey/Build Games/excerpt/apps/mac/Sources/Excerpt/Speech/SourceTranscriber.swift>), [DockPresence.swift](</Users/trey/Build Games/excerpt/apps/mac/Sources/Excerpt/App/DockPresence.swift>).

**Gate:** automated transition tests cover immediate stop during startup, repeated end, partial startup failure, capture loss, quit during capture, save failure, screenshot cancellation, and two meetings in one launch. Manual quit/interruption checks remain mandatory in Phase 8.

### Phase 3 — Remove the browser product and establish the editor workspace

**Work**

1. Move retained editor code to `apps/editor` and rename the package to `@excerpt/editor`. Keep relative bundle assets and the native `Resources/notes` destination.
2. Implement only library, meeting, and settings routes. The logo opens the library. Retired links resolve to the library, never to marketing or browser capture.
3. Provide native Start meeting and Open live notes actions before deleting the old browser entry points.
4. Delete the browser-only files/adapters/assets in the removal map. Remove obsolete exports, dependencies, browser environment variables, replay controls, and standalone web build/deployment configuration.
5. Require the native bridge in production. If unavailable, show a useful desktop-host error; do not silently open IndexedDB. Keep any mock host behind an explicit development/test-only entry point.
6. Preserve relevant fixtures, pure health logic, shared caption tokens, core algorithms, and legacy persisted enum decoding.
7. Update root scripts, workspace filters, lockfile, TypeScript/Vite/Turbo configuration, token generation, brand tooling, README, and distribution commands. Add clear root commands for building the engine, editor, and Mac app.
8. Ensure bundles are fresh. Current `build.sh` verifies resource existence but does not prove all outputs match source. Use a build dependency graph or generated input manifest to prevent silently packaging stale editor/engine resources.
9. Remove product-facing Chrome/SODA/tab-sharing/download-demo wording. Old research documents can retain historical terms when clearly marked as historical.

**Gate:** clean source-generated desktop build succeeds; production assets contain no browser capture/PiP/IndexedDB implementation; no reachable browser/demo/marketing route exists; no real-browser persistence fallback is invoked; retired data still decodes; the Mac editor and setup assets load offline.

### Phase 4 — Simplify setup and meeting controls

**Work**

1. Default to Cinema. Setup introduces the outcome, requests required permissions/model readiness, then provides a brief input check. Styling is optional and can be changed later.
2. Show selected microphone and native input health. Use a stable device ID; detect a missing/disconnected input and display an actionable notice. Avoid silent attribution changes after an unannounced fallback.
3. Add the native caption settings bridge. Menu/setup/editor settings must read and mutate the same persisted state, including overlay on/off preference.
4. Keep everyday controls focused: Start/End meeting, captions, Capture moment, Catch up, Open notes. Move folder/setup/diagnostics into secondary settings/help paths.
5. Starting should not activate the full editor or steal focus. Notes open automatically on completion; users can open live writing explicitly.
6. Register advertised start/end and caption shortcuts globally; register catch-up/capture only when relevant. Make registration conflicts visible with a menu fallback. Avoid double-firing through both menu equivalents and hotkeys.
7. Expose a simple caption-display selector or move-to-current-display action. Handle display disconnect and fullscreen transitions predictably without continuously following mouse movement.
8. Make screen-sharing behavior explicit in caption settings. Preserve the known current capturable-overlay default until measured. Do not claim private captions based solely on an API flag. A sharing-exclusion option is deferred unless tested on the actual supported capture paths.

**Gate:** one native start path from library/menu/shortcut, consistent settings after relaunch, no forced live editor, useful microphone feedback, visible shortcut conflicts, and no ordinary need to open diagnostics. Verify focus/fullscreen/display behavior in Phase 8.

### Phase 5 — Automatically compose visual notes

**Work**

1. Save a useful extractive document immediately when finishing, then enhance asynchronously. Show generation state in the document. An unavailable provider cannot leave an empty result or prevent saving.
2. Implement the generation lifecycle contract: source/input freshness, cancellation, no duplicate jobs, user-edit protection, and explicit retry.
3. Separate automatic captures from manually positioned blocks. A screenshot alone must not trigger a wording approval gate.
4. Compose moments using transcript evidence: group generated text by chronological topic occurrence; attach an automatically placed screenshot to the closest compatible passage using shared event IDs, then time overlap. Use the existing 20-second-before/15-second-after context as a default, not a guarantee of semantic relevance.
5. Keep automatic moments in chronological order. If the same topic returns much later, create a later section instead of pulling its screenshot back into an earlier topic. Never reorder a manually positioned image.
6. When there is no compatible text, retain the image as its own moment with a clear time/caption and optional surrounding transcript. Do not invent a description of its pixels or use an unrelated nearby decision.
7. Live paste/drop/import inserts immediately at the native meeting clock time and checkpoints the image. Finished-meeting imports can be added without a timestamp, then optionally placed. A file's modification date is not reliable proof of meeting time.
8. Make caption edits consistent across image metadata, document blocks, search, generation context, and exports. Keep captured time, corrected anchor, and document order distinct.
9. Suggest a concise title from supported transcript topics, retaining date-based fallback and user title overrides.

**Primary surfaces:** native meeting/provider code; [editor.ts](</Users/trey/Build Games/excerpt/packages/core/src/notes/editor.ts>), [generation.ts](</Users/trey/Build Games/excerpt/packages/core/src/notes/generation.ts>), [summary.ts](</Users/trey/Build Games/excerpt/packages/core/src/notes/summary.ts>), shared types, editor Notes/NotesDocument/image-import UI.

**Required fixtures**

- Text only; screenshots only; no content; handwriting plus transcript.
- Two screenshots in one discussion; repeated topic later; screenshot between topics; screenshot with no nearby speech; unknown-time imported image.
- Manual image reorder, manual caption edit, deleted block, transcript correction during generation, and provider failure.

**Gate:** end a synthetic meeting with several captures and no handwriting; the automatically generated document combines useful text and images without an acceptance dialog. Every screenshot is retained exactly once in the document unless the user intentionally removed it. Regeneration preserves manual edits/placements and does not invent visual facts or owners.

### Phase 6 — Make the document and library easy to use

**Work**

1. Default notes layout: editable title and saved/generation state; short summary; chronological topic/moment sections; concise next steps. Keep empty sections out of the way.
2. Replace the default Notes/Review/Transcript tab bar with the main document and secondary source/transcript access. Detailed review remains available through a secondary action. Preserve existing item editing/correction capabilities and state.
3. Give next steps one underlying item identity so completion/owner edits cannot disagree between the document and detailed review. Avoid two independently editable copies of the same action.
4. Consolidate export into one menu: copy, Markdown, and self-contained HTML with images. Make success/cancellation/failure feedback accurate.
5. Consolidate rewrite controls into a secondary menu; offer bounded undo. Keep provenance available in details and show cloud destination before a manual request. Explain that selecting the cloud provider also affects automatic end-of-meeting enhancement.
6. Keep screenshot context/source panels reversible: close/back returns to the user's document position. Support keyboard access and source correction without a mandatory review ritual.
7. Library provides Start meeting, search, recent meetings, quick rename, and deliberate delete. A missing/unreadable meeting is distinct from unavailable storage; neither should spin forever.
8. Settings focus on captions, microphone, note processing, and storage. Move extraction priorities/keywords into an advanced section, preserving existing values.
9. Replace dismissive or browser-specific copy. Use “No decisions or action items found. Your transcript and screenshots are saved.” Keep on-device transcription distinct from optional cloud rewriting.
10. Verify contrast, focus order, accessible labels, reduced motion, minimum window size, and keyboard text editing. Use inline controls sparingly so the document remains readable.

**Gate:** a new user can start, capture, end, read, correct, and export without visiting advanced review/settings. A power user can still reach transcript corrections, source evidence, and existing review actions. Exported image order and captions match the document.

### Phase 7 — Bound storage and rendering costs

**Work**

1. Measure before migrating storage. Build a synthetic 90-minute meeting with 30 high-resolution screenshots and a library of 100 meetings. Record hardware, actual data sizes, latency, memory, bytes written, and bridge payload sizes.
2. Remove full-library image payloads from ordinary listing. Return lightweight summaries; query/search persisted text without loading every image into the webview. Search must still cover titles, notes, transcripts, and captions.
3. Avoid retransmitting unchanged image bytes or rewriting them per keystroke/transcript event. First use bounded save coalescing and incremental updates where sufficient. If asset extraction is needed, use versioned native image files with lazy local resource URLs.
4. Any asset migration must be atomic/restartable, read old data URLs, preserve recoverable drafts, and verify new files before dropping legacy inline copies. Never rewrite a user's entire library at launch just to simplify implementation.
5. Keep image decoding off the critical input/caption path where possible. Bound generation and snapshot work so captions and typing remain responsive.
6. Add meaningful performance regression checks around payload shape and repeated I/O; do not create machine-fragile microbenchmark assertions.

**Targets to measure, not claim in advance:** no recurring main-thread stalls above 100 ms during steady typing/capture on the test Mac; warm library display under 1 second at the fixture size; confirmed save feedback normally under 1 second; no monotonic retained-memory growth across repeated meetings. If missed, report measurements and fix the responsible path.

**Gate:** image-heavy data remains intact through capture, edit, reopen, search, and HTML export; measurements and any exceptions are recorded. Storage-schema migration is required only if simpler changes cannot meet the measured workload.

### Phase 8 — Validate the real desktop build and package it

**Work**

1. Run fresh unit, integration, schema/parity, typecheck, generated-resource, and build checks. Bundle the exact tested source state.
2. Exercise the real native app with synthetic audio/meeting content: first-run permissions; selected microphone; both audio sources; silence; recognition failure; repeated meetings; quick stop; forced interruption; quit while speaking; recovery; full-screen calls; display changes; shortcut conflicts; caption contrast; and screenshot cancellation.
3. Measure caption first-word latency and presentation cadence separately from finalized transcript delay. Target first useful captions within 2 seconds for ordinary clear speech on the test setup; record actual results and identify exceptions rather than concealing them. Confirm that two-line cues remain readable and clicks reach the meeting.
4. Compare transcript against known spoken content, including names/numbers and overlapping speech. Preserve the current one-source-at-a-time caption behavior unless a change is supported by testing; remove misleading overlap claims from documentation.
5. Verify whole-display versus window screen sharing and record whether captions are visible to others. Check native region captures exclude Excerpt's own overlay as intended.
6. Finish a representative meeting, inspect its visual notes, make corrections, reopen, export, and open HTML offline. Verify image legibility, caption text, source links, and order.
7. Update README and distribution instructions to the desktop-only product. Check compatibility and signing claims in the packaged Read Me. Mark older implementation plans as historical where they conflict.
8. Build and verify a release `.app` and `.dmg` with the authorized signing identity. Do not silently use ad-hoc signing or reset permissions. If Apple Developer ID credentials are unavailable, report a locally signed preview, not a notarized public release.

**Gate:** record actual native acceptance evidence plus artifact path/signature status. If desktop automation or hardware is unavailable, report “implementation complete; native acceptance pending” with the exact unperformed checks. Do not mark release readiness complete on unit-test evidence alone. Publishing a release or changing external hosting requires its own explicit instruction.

## 5. Review traceability

| Review concern | Owning phases |
| --- | --- |
| Latest-meeting edits dropped; prior meeting blocked during capture | 1 |
| Generated notes invisible until reload | 1, 5 |
| Blocking quit/final transcript loss | 2, 8 |
| Hidden capture interruption and source health | 2, 4, 8 |
| Caption settings disagree | 4 |
| Desktop link enters browser capture | 3 |
| Empty overlay suppresses Dock presence | 2, 8 |
| Advertised shortcuts not global | 4, 8 |
| Export/delete errors swallowed | 1, 6 |
| Setup friction and microphone uncertainty | 4, 8 |
| Editor steals focus on start | 4 |
| Screenshots require approval/poor text placement | 5 |
| Precise timestamp required for import | 5 |
| Too much review/generation UI | 6 |
| Storage/cloud claims disagree | 6, 8 |
| Full snapshots and image-heavy library | 7 |
| Unsupported install/release claims | 8 |
| User's desktop-only removal request | 3, 6, 8 |

## 6. Verification commands and operational cautions

Before the workspace rename, existing commands are:

```sh
pnpm exec turbo test --force
pnpm typecheck
pnpm --filter @excerpt/core build:engine
pnpm --filter @excerpt/web build:notes
node apps/mac/tools/sync-caption-tokens.mjs --check
```

After Phase 3, use `@excerpt/editor` in place of `@excerpt/web`, and add the agreed root Mac build command. Typecheck the core/types as well as the editor; the current root typecheck task primarily covers the web package.

From the Mac package directory, run `swift test`, then the real app build with the stable signing identity. In this environment the previous successful test invocation used:

```sh
CLANG_MODULE_CACHE_PATH=/private/tmp/excerpt-review-clang swift test --disable-sandbox --cache-path /private/tmp/excerpt-review-swift-cache
```

Use a task-specific cache directory if needed; do not change HOME or erase existing build/data folders to get a passing run. Generate the engine before Swift parity tests that require it. Update fixture/resource paths after moves. Tests must exercise the production merge/bridge code rather than a rewritten formula inside the test.

Do not hand-edit generated engine/editor bundles or [CaptionTokens.generated.swift](</Users/trey/Build Games/excerpt/apps/mac/Sources/Excerpt/Captions/CaptionTokens.generated.swift>). Fix their source and regenerate. Do not delete the application-support folder, Keychain keys, TCC grants, saved meetings, browser databases, or unrelated local changes.

## 7. Execution ledger and handoff format

Update this ledger after each phase. Use `not started`, `in progress`, `implemented / acceptance pending`, `complete`, or `blocked`. A phase is complete only when its gate is supported by evidence.

| Phase | Status | Evidence / remaining work |
| --- | --- | --- |
| 0 | complete | Added shared synthetic persisted-meeting fixtures (`packages/core/fixtures/desktop-meetings.json`) for text-only, screenshot-only, handwritten, corrected, reviewed, deleted-block, legacy-section, and interrupted-draft meetings; `desktop-regressions.json` assigns every reviewed regression to its owning phase. TypeScript and Swift tests decode them through the actual shared/native models and round-trip them through isolated native storage. Added an explicit test-only fake native host for editor/bridge tests; production code does not import it. Native storage was already root-injectable; capture/transcriber and provider seams are now injectable for deterministic lifecycle/generation tests. Final checks: `pnpm exec turbo test --force` passed (218 core, 7 web); `pnpm typecheck`, caption-token sync, engine build, editor-bundle build, and `swift test` passed (137 tests in 20 suites; four conditional real-speech/model evaluations skipped). Production browser-dependency inventory before Phase 3: `apps/web` routing/capture/onboarding/demo/marketing views and media; `packages/core/src/capture/{live,devices,demo}`; `packages/core/src/store/{meetings,preferences}` plus `idb-keyval`; root/web build scripts and `apps/mac` bundle references to `@excerpt/web`. Generated resources were rebuilt from source (engine and notes bundle); AppIcon and generated caption tokens are present. No production data was read or modified. Local signing identity check found 0 valid identities, so real signed build/package acceptance remains Phase 8 pending credentials. Next: Phase 1 revision/mutation persistence, starting with finished-meeting writes and acknowledgment-aware editor synchronization. |
| 1 | complete | Added a shared, legacy-compatible meeting/document/source revision model and typed mutation/acknowledgment contract in TypeScript and Swift. Native writes now use idempotent operation IDs, explicit field operations, conflict/rebase handling, atomic persistence, and acknowledgments issued only after the store write succeeds. Finished-meeting editor writes no longer use `MeetingSession.lastSaved` or unrestricted bridge snapshots: the bridge routes only the matching active meeting through the session and persists any other completed meeting independently. Live capture and background enhancement use revisioned store updates; native speech/screenshots survive concurrent editor writes, untouched editors receive generated notes, writing during generation remains authoritative with the generated document retained as a suggestion, and deleted meetings cannot be revived by generation or queued mutations. Corrections, review state, image bytes/captions/blocks, deleted blocks, suggestions, and generation state survive reload. Journal/checkpoint failures mark recovery health degraded. Export and delete now await durable native outcomes, distinguish save-panel cancellation, propagate errors through TypeScript, and retain library entries on failed deletion. Browser persistence/routes remain present for Phase 3. Boundary coverage uses the real `MeetingStore`, `NotesBridge`, `MeetingEnhancer`, mutation reducer, editor synchronization, Phase 0 synthetic fixtures, and isolated temporary storage. Final checks: `pnpm exec turbo test --force` passed (218 core, 13 web); `pnpm typecheck` passed; `CLANG_MODULE_CACHE_PATH=/private/tmp/excerpt-phase1-clang swift test --disable-sandbox --cache-path /private/tmp/excerpt-phase1-swift-cache` passed (144 tests in 20 suites; four conditional real-speech/model evaluations skipped); engine and editor bundles rebuilt successfully; `node tools/sync-caption-tokens.mjs --check` reported tokens in sync; `git diff --check` passed. Remaining work is Phases 2–8 and the real signed/package acceptance check remains blocked until a signing identity is available. Exact next step: Phase 2, centralize session lifecycle transitions and session identity, clean up partial starts, and replace semaphore termination with deferred asynchronous termination. Current worktree: baseline `ac7ef19`, with preserved uncommitted Phase 0 and Phase 1 source/test/doc changes; planning documents and new fixtures/tests/sources remain untracked, generated bundles were regenerated from source, and no production meeting data, permissions, signing settings, browser surfaces, or unrelated user work were changed. |
| 2 | complete | Centralized native lifecycle state as idle/starting/listening/finishing/completed/interrupted/failed and guarded every asynchronous capture, transcription, live-edge, and settled-speech callback with a unique session token. Immediate stop during transcriber or ScreenCaptureKit startup cannot return to listening; partially started resources are finalized or cancelled; repeated starts/stops are idempotent; per-run transcribers and UUID-suffixed timestamp meeting IDs make back-to-back meetings independent. `CaptureEngine` rejects late buffers/errors from obsolete streams and `SourceTranscriber` invalidates starts suspended in format discovery. Replaced the main-actor-blocking termination semaphore with `applicationShouldTerminate` deferred termination and one asynchronous completion reply: required transcript finalization and the finished store write drain before reply, while optional enhancement is not awaited and queued/running enhancement resumes from durable state next launch. Finished meetings persist additive `finishReason` and `captureError`; manual stops and capture interruptions share one post-save callback that opens the exact saved meeting, while failed saves retain a retryable in-memory snapshot plus journal and never reopen a previous meeting. Capture interruption retains a distinct interrupted state/status. The overlay is cleared and hidden on finish so Dock policy recomputes, while the caption-enabled choice is persisted independently from actual window visibility. Recovery health now combines live audio and persistence concerns and clears only after durable writes recover; ordinary silence remains non-failing. The headphone suggestion now fires once from measured live echo suppression rather than a stop-time counter checked at start. The interactive region picker is task-cancellable on stop, interruption, or quit; late picker results retain their original meeting identity and are discarded instead of attaching to another meeting. Recovery still accepts transcript-free handwritten/image drafts, and recovered meetings record a recovered finish reason. Added production-boundary lifecycle tests for immediate stop at both startup suspension points, repeated end, partial capture-start failure, capture loss, deferred quit during an open picker, enhancement not blocking quit, late screenshot rejection, durable save failure/retry, exact completion routing, recovery-health restoration, live echo advice, unfinished generation resumption, caption preference, and two meetings in one launch. Final checks: `pnpm exec turbo test --force` passed (218 core, 13 editor); `pnpm typecheck` passed; `CLANG_MODULE_CACHE_PATH=/private/tmp/excerpt-phase2-clang swift test --disable-sandbox --cache-path /private/tmp/excerpt-phase2-swift-cache` passed (155 tests in 21 suites; four conditional real-speech/model evaluations skipped); engine and editor bundles rebuilt successfully; caption-token check passed; `git diff --check` passed. Manual real quit, capture interruption, audio-device, fullscreen/Dock, and region-picker behavior remain mandatory Phase 8 acceptance and were not claimed from unit tests; signed package acceptance remains blocked by the unavailable signing identity. Exact next step: Phase 3, move the retained React editor to `apps/editor` / `@excerpt/editor`, add native Start/Open actions before removal, then remove browser capture/storage/onboarding/demo/marketing routes and production IndexedDB fallback while preserving legacy decoding and explicit test-only hosts. Current worktree: baseline `ac7ef19` with preserved uncommitted Phase 0–2 source/test/doc changes; new lifecycle/termination/screenshot coordinator sources and Phase 2 tests are untracked, generated engine/editor resources were rebuilt from source, and no production meetings, permissions, signing settings, external hosting, or unrelated user work were changed. |
| 3 | complete | Moved the retained React desktop editor to `apps/editor` / `@excerpt/editor`; preserved the Mac `Resources/notes` destination and rebuilt it from source. The editor now exposes only library, meeting, and settings routes; every retired browser/demo/marketing hash resolves to the library, the wordmark opens the library, and a missing host renders a desktop-host error instead of opening browser storage. Added typed native `startMeeting`/`openLiveNotes` bridge operations, connected them to library controls and the native session coordinator, and covered both the native bridge boundary and explicit test-only fake host. Removed browser capture/device/PiP/demo/onboarding/marketing code, IndexedDB and `idb-keyval`, web deployment configuration, product-shot/demo assets, and browser-only tooling while retaining source-health logic, shared algorithms, fixtures, and legacy `processing: "demo"` decoding (displayed as legacy). Root commands now provide engine/editor/Mac builds; `apps/mac/build.sh` regenerates engine/editor resources on every invocation so stale resources cannot pass its check. Final checks: `pnpm exec turbo test --force` passed (199 core, 15 editor); `pnpm typecheck` passed; engine and editor resources rebuilt; caption-token check passed; source and generated-bundle audit found no browser capture/PiP/IndexedDB routes or implementation; `CLANG_MODULE_CACHE_PATH=/private/tmp/excerpt-phase3-clang swift test --disable-sandbox --cache-path /private/tmp/excerpt-phase3-swift-cache` passed (156 tests in 22 suites; four conditional speech/model evaluations skipped); `git diff --check` passed. The native app package was not built because the stable signing identity remains unavailable and ad-hoc signing is intentionally disallowed. Manual hardware/UI acceptance remains Phase 8. Next: Phase 4, unify native caption/microphone settings and simplify setup/everyday controls without forcing live notes open. |
| 4 | complete | Phase 4 controls, setup input check, unified native settings, microphone selection/loss handling, and start/end fixes are in pushed commit `42c5dbe`. The formerly blocked full Swift gate passed with full Xcode: 167 tests in 24 suites. Pushed-checkpoint JavaScript, typecheck, resource, token, and desktop-boundary checks also passed. Real microphone, focus, fullscreen, display and sharing behavior remains Phase 8 manual acceptance; signed packaging still needs an authorized identity. |
| 5 | complete | End now durably saves extractive visual notes before optional enhancement. Shared composition links automatic captures to supported transcript passages, preserves chronological recurrences and all manual writing, image moves, captions, and deletions; native generation handles freshness, coalescing, cancellation, retry, and suggestions when edited. Live imports use the native clock; finished imports retain unknown time until anchored. Engine contract version 3. Final checks: 210 core + 23 editor tests, typecheck, engine/editor builds, caption-token sync, 170 Swift tests in 24 suites, desktop-boundary audit, and `git diff --check`. Phase 5 and the first Phase 6 pass were pushed in `0d36b71` on `note-and-transcript-quality`; no production data or signing state accessed. |
| 6 | implemented / acceptance pending | The first pass in `0d36b71` made notes primary; transcript and detailed review secondary, grouped export/rewrite controls, exposed advanced extraction settings, and clarified provider disclosure. The second pass makes a finished meeting read as title and save state → supported Summary (at most three lines) → chronological Next steps → editable Notes. Empty sections and duplicate image thumbnails are removed; each saved image remains once in document order. Next steps are the existing `Meeting.items`, edited through the same typed `setReviewItems` path as detailed review, with no parallel copy or inferred owner. Markdown/HTML exports reflect the summary and completion. Source, moment, transcript, and review trips restore scroll and focus; transcript corrections edit inline. Missing and unreadable meetings have distinct recoverable states, the sidebar reports storage failures, library actions have clearer keyboard labels, and narrow-window contrast/motion issues were addressed. Post-review fixes make summary lines follow edited or deleted topic bullets even when key-point and block IDs differ, and propagate a failed library read to the sidebar. Added core overview, editor document-journey, and Swift next-step regressions. Final checks (September 23, 2026): `pnpm exec turbo test --force` passed (216 core, 36 editor); `pnpm typecheck`, engine/editor resource builds, caption-token check, `git diff --check`, and the desktop-boundary audit passed; Swift passed 173 tests in 25 suites. A synthetic Chromium preview at 1100×800 and 720×520 found no horizontal overflow and exercised panel return/focus. Real WKWebView UI, VoiceOver/Full Keyboard Access, keyboard writing, capture/export dialogs, hardware and signed-package acceptance remain unperformed Phase 8 work. No production meetings, browser databases, Keychain, permissions, signing, or hosting were touched. Next: Phase 7 measurement with a synthetic 90-minute meeting, 30 screenshots, and a 100-meeting library; carry real-app UI/accessibility checks into Phase 8. |
| 7 | in progress | First measured pass on an isolated M2 MacBook Air fixture (90 minutes, 30 valid high-resolution PNGs, 100 meetings): a 29.6 MB meeting made the old library bridge response 30.5 MB, with about 44 ms native decode and 94 ms full-list encode; a title edit rewrote 29.6 MB. Native `listMeetings` now returns small entries and `searchMeetings` returns only matching snippets; the editor searches asynchronously with a 120 ms debounce. The measured library response is 19 KB, while native list/search still take about 43 ms each because they decode full files. Unchanged image objects no longer have their base64 serialized for a document-wording mutation. Native/editor regressions cover omitted image bytes, title/note/caption/transcript search, full-image reopen, rename preservation, and unchanged-byte comparisons. Details and exact command are in `DESKTOP-PHASE-7-MEASUREMENTS.md`. Remaining: measure end-to-end typing/save and memory, remove repeated native image-heavy reads/writes and full mutation acknowledgments, then validate image-heavy capture/edit/reopen/search/HTML export. No asset migration has been attempted. Do not mark the Phase 7 gate complete from these bridge measurements. |
| 8 | Not started | — |

At every implementation handoff, report: completed phase(s); changed files and behavior; actual tests/results; unresolved risks; any externally blocked checks; and the exact next step. Include current revision or working-tree state so the next model continues the same work. Do not claim the plan itself is an implementation or mark manual checks as passed because the code appears correct.
