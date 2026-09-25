# Excerpt desktop review

Reviewed September 22, 2026 · repository revision `ac7ef19`

**Verdict: the foundation fits the intended product, but the meeting-to-notes handoff is not reliable enough yet. The next iteration should simplify and complete that journey before adding more features.**

The product promise should be: **“Follow the conversation with movie-style captions. Capture what matters on screen. Leave with clear notes that keep both together.”**

This review treats Granola/Tactiq as the user's category reference, not as a request for competitive feature parity. The goal is a small personal meeting companion, with visual context as the differentiator.

## Scope and confidence

Reviewed native setup, menu controls, capture, transcription, caption presentation, screenshots, catch-up, lifecycle, recovery, storage, the native/web bridge, document editing, generation, preferences, library, and export. Findings below come from source inspection unless explicitly described as test results. No production code was changed.

Validation:

- Fresh TypeScript run: 214 core tests and 6 web tests passed (`pnpm exec turbo test --force`).
- `pnpm typecheck` passed.
- Swift Testing reported 134 tests across 18 suites passing. Conditional speech-fixture tests were not enabled; this is not a live-audio accuracy result. The first attempt hit a cache permission error; rerunning with caches in `/private/tmp` and SwiftPM sandboxing disabled succeeded.
- Interactive desktop inspection was attempted through the computer-use skill. Orca was unavailable, and opening it returned `runtime_open_timeout`. No visual or live-meeting results are claimed.

Typography, perceived caption latency, actual full-screen behavior, multi-monitor usability, screen sharing, microphone switching, and long-session performance still require an interactive pass.

## What is worth keeping

| Capability | Assessment |
| --- | --- |
| Native cinematic captions | Strong product foundation: two-line presentation, phrase breaking, restrained fades, click-through overlay, size/position controls, and accessibility contrast/motion handling. |
| Explicit region screenshots | Good simple interaction. Capture time, image, and nearby speech are linked without continuously collecting the screen. |
| Catch-up | A useful optional escape hatch when captions move on. Provisional text is separated from saved transcript text. |
| Editable notes | Correct output format for this product. People can write normally and retain images instead of managing only extracted cards. |
| Traceable source passages | Valuable when checking an important decision. Keep available without requiring routine verification of every bullet. |
| Local storage and recovery | Atomic meeting saves, transcript journals, draft checkpoints, and image recovery are good foundations. Error handling still needs work. |
| Portable export | Self-contained HTML is a practical way to preserve images; Markdown supports text-oriented workflows. |

## Functional findings, in priority order

### 1. P1 — Edits to the latest completed meeting are silently dropped

**Trigger:** finish a meeting, then correct its transcript, confirm/dismiss an action, or import an image.

`ownsEditorWrites` continues claiming the last saved meeting. Its completed-meeting branch copies only `title`, `notes`, and `suggestedNotes` from the editor. It omits `events`, `items`, `images`, and `sourceRevision`. The bridge returns the old values as a successful save, and the editor displays “Saved on this device.” An imported image block can survive in the document while its image data does not.

There is a second consequence: if a new meeting is active, editing the preceding meeting still enters this owner path, then fails the current-meeting ID guard.

**Fix:** separate live capture merging from completed-meeting persistence. Completed meetings must accept all supported user edits while preserving only genuinely concurrent changes. Do not route the previous meeting through the active session solely because it is `lastSaved`.

**Acceptance:** finish A; edit an action, correct text, and add an image; reload and verify every change. Start B, edit A again, and verify saving still works.

Evidence: [MeetingSession.swift:212](</Users/trey/Build Games/excerpt/apps/mac/Sources/Excerpt/Meeting/MeetingSession.swift:212>), [NotesBridge.swift:176](</Users/trey/Build Games/excerpt/apps/mac/Sources/Excerpt/Notes/NotesBridge.swift:176>), [Notes.tsx:163](</Users/trey/Build Games/excerpt/apps/web/src/views/Notes.tsx:163>).

### 2. P1 — Automatic notes can be saved but remain invisible in the open editor

**Trigger:** leave the live draft empty, stop the meeting, and wait for automatic generation.

The live draft already has a non-null notes object with empty blocks. Finished meetings have no `draftRevision`. The React update merge accepts incoming notes only when their draft revision increases; otherwise it preserves `current.notes`. Thus a native update containing the generated document can retain the empty document on screen. Reopening the window reloads the saved result, but editing the stale document first can overwrite it.

**Fix:** distinguish live draft revisions, completed document revisions, and unacknowledged local edits. Accept the completed generated document when there is no conflicting writing. Show generation progress in the document itself.

**Acceptance:** an untouched meeting displays its generated notes automatically, without navigation or reopening. Typing during generation preserves the user's text and still exposes the generated result.

Evidence: [Notes.tsx:128](</Users/trey/Build Games/excerpt/apps/web/src/views/Notes.tsx:128>), [MeetingSession.swift:629](</Users/trey/Build Games/excerpt/apps/mac/Sources/Excerpt/Meeting/MeetingSession.swift:629>).

### 3. P1 — Quit blocks the actor needed to finish the meeting

`applicationWillTerminate` creates a task to stop the main-actor session, then blocks the same actor with a semaphore for up to five seconds. The task cannot perform the intended orderly stop during that wait. The transcript journal reduces loss, but the final volatile speech and clean save are not guaranteed.

**Fix:** use deferred application termination: finish asynchronously, then reply to the termination request. Retain recovery as a fallback.

**Acceptance:** quit while speaking. The app completes promptly, preserves the final speech, saves the meeting, and does not require recovery for an ordinary quit.

Evidence: [AppDelegate.swift:631](</Users/trey/Build Games/excerpt/apps/mac/Sources/Excerpt/App/AppDelegate.swift:631>).

### 4. P1 — Capture interruption loses its distinct user-facing outcome

`reportCaptureLoss` sets an interruption message, then `finish` immediately replaces it with normal saving/status text. `FinishReason` is passed but not used to preserve an interrupted state. Automatic interruption also bypasses the menu action that normally opens the saved meeting.

Health concerns are otherwise exposed mainly through the menu's status line. A person watching the meeting may not open that menu when capture fails.

**Fix:** persist the interruption reason, present one clear notice, open the partial notes, and offer an obvious restart action. Give a genuinely failed source a visible warning without reporting ordinary silence as a fault.

**Acceptance:** interrupt the capture stream mid-meeting; show “Listening stopped. Your notes so far are saved,” identify the failed source when known, and expose the partial meeting.

Evidence: [MeetingSession.swift:386](</Users/trey/Build Games/excerpt/apps/mac/Sources/Excerpt/Meeting/MeetingSession.swift:386>), [MeetingSession.swift:489](</Users/trey/Build Games/excerpt/apps/mac/Sources/Excerpt/Meeting/MeetingSession.swift:489>), [AppDelegate.swift:259](</Users/trey/Build Games/excerpt/apps/mac/Sources/Excerpt/App/AppDelegate.swift:259>).

### 5. P2 — Desktop caption preferences do not control desktop captions

The Preferences page calls `applyPreset`, which updates DOM attributes and web local storage. Native captions read a separate UserDefaults key and change through `OverlayController`. The bridge exposes no caption-setting operation. The two settings surfaces can therefore disagree while both appear authoritative.

**Fix:** use one native setting source and bridge it into Preferences, or remove the duplicate web control in the desktop host.

**Acceptance:** change the preset from either surface; the real overlay updates and the other surface shows the same choice after reopening.

Evidence: [Preferences.tsx:114](</Users/trey/Build Games/excerpt/apps/web/src/views/Preferences.tsx:114>), [captionPreset.ts:34](</Users/trey/Build Games/excerpt/apps/web/src/captionPreset.ts:34>), [OverlayWindow.swift:110](</Users/trey/Build Games/excerpt/apps/mac/Sources/Excerpt/Captions/OverlayWindow.swift:110>).

### 6. P2 — The desktop empty state sends people into browser capture

The library's “Capture a meeting” link always targets `#/record`. That route mounts browser capture, including its Chrome requirements. The desktop sidebar hides “New meeting,” but the empty-state link remains. The brand link also routes to the marketing landing page inside the app.

**Fix:** provide a native Start meeting action in the library; route the desktop brand to the library. Keep browser-specific acquisition flows outside the desktop workspace.

**Acceptance:** on an empty desktop library, the primary action starts native setup/capture and never asks for Chrome.

Evidence: [Library.tsx:39](</Users/trey/Build Games/excerpt/apps/web/src/views/Library.tsx:39>), [App.tsx:98](</Users/trey/Build Games/excerpt/apps/web/src/App.tsx:98>), [NotesWorkspace.tsx:94](</Users/trey/Build Games/excerpt/apps/web/src/views/NotesWorkspace.tsx:94>).

### 7. P2 — An invisible overlay keeps the app out of the Dock after stopping

Finishing clears the caption text but never hides the overlay. `DockPresence` gives overlay visibility precedence over notes-window visibility. After a normal stop, the notes can be open while the app still behaves as an accessory app, making it harder to find through normal app switching.

**Fix:** end the overlay session when capture ends; distinguish a transparent window existing from captions actively being shown.

**Acceptance:** stop with captions enabled; the notes open and Excerpt becomes reachable through its normal Dock/app-switching presence.

Evidence: [MeetingSession.swift:517](</Users/trey/Build Games/excerpt/apps/mac/Sources/Excerpt/Meeting/MeetingSession.swift:517>), [DockPresence.swift:81](</Users/trey/Build Games/excerpt/apps/mac/Sources/Excerpt/App/DockPresence.swift:81>).

### 8. P2 — Advertised start/caption shortcuts are not global shortcuts

Setup presents Command-Shift-R and Command-Shift-C as the start/caption shortcuts. They are menu key equivalents, while only catch-up and screenshot are registered as global hotkeys. They cannot be relied on while the meeting app has focus. Shortcut registration conflicts for the actual global shortcuts are only logged.

**Fix:** register the advertised controls globally or describe their scope accurately. Show shortcut conflicts with a working menu fallback.

**Acceptance:** with the meeting app focused, each advertised global shortcut works; a conflict is visible in settings.

Evidence: [SetupView.swift:342](</Users/trey/Build Games/excerpt/apps/mac/Sources/Excerpt/Setup/SetupView.swift:342>), [MeetingShortcuts.swift:32](</Users/trey/Build Games/excerpt/apps/mac/Sources/Excerpt/Review/MeetingShortcuts.swift:32>).

### 9. P2 — Export and deletion can report success when the operation failed

Export suppresses file-write errors, and the bridge returns before the save panel/write completes. Deletion is declared throwing but suppresses file-removal errors. These paths do not provide reliable success/failure feedback.

**Fix:** propagate errors, distinguish cancellation from completion, and show success only after the file operation succeeds.

**Acceptance:** test an unwritable export destination and a failed deletion; retain the data and provide a useful error.

Evidence: [NotesBridge.swift:214](</Users/trey/Build Games/excerpt/apps/mac/Sources/Excerpt/Notes/NotesBridge.swift:214>), [MeetingStore.swift:89](</Users/trey/Build Games/excerpt/apps/mac/Sources/Excerpt/Storage/MeetingStore.swift:89>).

## Review of the intended experience

### Before the meeting

Setup explains the native permissions and model installation, but asks people to choose a caption look before they have experienced the main value. Default to Cinema. Keep a preview available, then make the main setup work permission grants and a short “I can hear you / I can hear the meeting” check.

The desktop capture engine takes the default microphone and broad system audio; there is no normal microphone picker or per-meeting source selection. A small microphone selector and visible input check are more useful than exposing the diagnostics window. Clearly say that other Mac audio can enter the transcript. App-specific capture can remain a later enhancement unless this proves a frequent problem.

The unsigned distribution and macOS 26/Apple silicon requirement are significant installation constraints. Treat them as part of usability: make compatibility obvious before download, and prioritize a normal signed/notarized release before expecting broad nontechnical adoption.

### During the meeting

Starting currently shows captions and also opens/activates the full notes window. For the requested focus, that is unnecessary interruption. Default to returning attention to the meeting. Make live notes optional.

The everyday controls should be small and predictable: listening status, captions, capture moment, catch up, and End meeting. Put caption styling, folders, setup, and diagnostics behind settings/help.

Keep caption presentation restrained. The existing implementation already separates volatile recognition from readable displayed cues and bounds the text to two lines. Preserve that work. Test read time, replacement cadence, bright slides, busy screens, overlapping voices, and fullscreen meetings with actual users. The native owner selection shows one source at a time, so the README's overlapping-speaker film-dash description should not be assumed to describe desktop behavior.

Multi-monitor targeting currently chooses the pointer's screen when showing the overlay, not the meeting window. “Follow pointer” is exposed in diagnostics. Provide a simple “Move captions to this display” control if multiple displays are common; do not continuously chase every pointer movement.

The overlay is deliberately capturable. Verify what a screen-sharing participant actually sees and communicate that behavior. Personal captions and shared presentation captions are different expectations; the current default needs a deliberate product decision.

### Screenshots and visual context

This is the most distinctive part of Excerpt. The region shortcut and brief saved-image receipt are good. Context is a fixed window spanning 20 seconds before and 15 seconds after capture, reconciled as final speech arrives. That is a useful default, not proof that the words refer to the image.

The main opportunity is better automatic composition after the meeting. `hasWriting` treats an image block as writing, so even a screenshot-only draft makes generated notes a suggestion to accept. The generation merge preserves image positions and appends unmatched generated text. Images captured into an otherwise empty draft can therefore remain ahead of the relevant explanation rather than forming an automatically organized visual note.

Use captured moments as anchors: a screenshot, a short useful explanation, the relevant decision/action when present, and an expandable source passage. Preserve deliberate user positioning, but distinguish it from an automatically appended capture. A screenshot should not, by itself, force an extra wording-approval workflow.

Pasting/importing in the live notes editor currently opens a placement form. Default live imports to the current meeting time immediately, with an optional correction afterward. In finished notes, allow “unknown time” or easy approximate placement instead of making a precise timestamp a prerequisite.

There is no OCR or image understanding; the default Apple notes generation is transcript-based, and the cloud path sends captions/metadata rather than pixels. Describe the benefit as keeping visual evidence with the conversation. Automatic claims about chart values or what a screenshot depicts would exceed current functionality.

### After the meeting

The main result should be one readable document:

1. A useful editable title and a brief summary.
2. Topic sections combining text and relevant screenshots.
3. A short next-steps section, with owners only when actually supported.
4. An expandable transcript/source view.

The current Notes / Review / Transcript split provides useful power but makes the product feel like an extraction-review tool. Keep Notes primary. Move confirmation, category changes, related-item merging, and generation provenance into optional details. Make the separate Review workflow an advanced option unless research shows ordinary users depend on it.

Similarly, “Improve notes,” “Shorter,” “More detail,” generation comparisons, source updates, Markdown export, and HTML export should not all compete at the top of the default page. Generate the default result automatically; offer one secondary rewrite menu and one export menu. Keep a reversible way to restore prior generated wording.

Generation status needs to be visible where the notes appear. Show useful transcript-derived content promptly, then update or offer enhanced wording according to whether the person has edited it. Do not leave an empty writing canvas while a hidden menu status says “organizing notes.”

“Nothing worth noting was said” is also the wrong empty-result message: the extractor failing to identify its categories is not a judgment on the meeting's value. Prefer “No decisions or action items found. Your transcript and screenshots are saved.”

### Library, preferences, and trust

Search already covers titles, notes, transcripts, and image captions. That is enough for a first version. Default date-based titles are less useful than a short suggested topic title; always allow a quick rename. Avoid introducing folders, tags, shared workspaces, or a task-management system before the main journey is dependable.

Preferences should primarily contain captions, microphone, note processing, and storage/export. Review-category ranking and keyword boosts are niche controls; move them into an advanced area.

Cloud enhancement is disclosed in Preferences, and keys are held in Keychain. However, automatic post-meeting enhancement uses the selected provider too. State that selecting OpenAI applies to future automatic summaries, not only a button clicked in the notes. Revise blanket “nothing leaves this Mac”/“no server” wording where it can coexist with that choice. Keep transcription location distinct from note-generation location.

## Performance and test gaps

Image data is embedded in meeting JSON. Each settled transcript event rebuilds/checkpoints the draft and publishes the entire meeting to the webview; each edit can serialize/save the full document. The library decodes full meeting files as well. With many screenshots, this creates a credible main-thread I/O and serialization risk. It is not a measured slowdown from this review.

Benchmark a 60–90 minute meeting with at least 30 high-resolution screenshots while typing, capturing, and opening the library. If needed, store images separately, send incremental updates, coalesce editor saves, and maintain lightweight library metadata. Preserve atomic saves and recovery when doing so.

The passing tests give useful coverage of extraction, pure merge functions, storage, source health, and caption rules. They do not cover the full native bridge + React lifecycle that contains several findings above. Prioritize integration tests for finished-meeting edits, live-to-finished updates, automatic generation, quit, interruption, and image persistence. Also test start-then-immediate-stop and repeated meetings, because startup has asynchronous suspension points.

## Recommended implementation order

| Stage | Work | Completion criterion |
| --- | --- | --- |
| 1 — Trust | Completed-meeting persistence, generated-note visibility, asynchronous quit, interruption state, and honest I/O errors | A meeting and every user edit survive end, reopen, interruption, and ordinary quit. |
| 2 — One desktop journey | Native start from library, correct empty state, unified caption settings, reliable shortcuts, overlay/Dock cleanup, optional live editor | A new user can start and end a meeting without visiting a browser flow or diagnostics. |
| 3 — Visual notes | Automatic screenshot-aware composition, immediate live image insertion, clear generation progress, quieter note controls | End meeting produces a useful combined document without requiring generation or placement decisions. |
| 4 — Release checks | Real audio, fullscreen, displays, sharing, accessibility, long-session performance, installer | The default journey works in ordinary meeting conditions, not only pure tests. |

Defer calendar integrations, team features, cross-meeting chat, automatic screenshot collection, extra caption themes, and complex task management. The current opportunity is to make the existing distinctive experience dependable and effortless.
