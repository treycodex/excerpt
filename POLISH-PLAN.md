# Excerpt: review and polish plan

Reviewed and implemented 10 September 2026.

Implementation covers capture recovery and lifecycle cleanup, truthful save and product states, evidence context and correction controls, landing/notes/capture/library hierarchy, caption/PiP behavior, keyboard strip and skip navigation, responsive layout, and focused lifecycle tests. Real Chrome audio, PiP, screen-reader, and ambient-bed checks still require hands-on verification on the target Mac.

## Assessment

Excerpt has a distinctive visual identity and a credible product constraint: notes that can be checked against what was said. Preserve the serif display type, restrained ground, subtitles, strip, and corner frames. The highest-value work is making that promise immediate, readable, and reliable throughout the interaction.

The experience currently spends too much space explaining itself before showing its value. At 1280×720, neither landing CTA appears in the initial viewport, and the notes masthead pushes every note below the fold. The evidence interaction works by jumping between distant parts of a long page. Several recovery and correction paths also fall short of the copy's promises.

## Evidence and limits

- Read all of `CONTEXT.md`, the application views, shared styles and strip, capture lifecycle, persistence, preferences, and Markdown export.
- Visually reviewed local landing, demo, notes, and strip selection at 1280×720. Checked nav build timestamp **2026-09-10 03:23 UTC** before testing.
- Exercised demo start, pause, skip to notes, and selection of a decision from the strip. The notes showed one settled decision, one action assigned to you, and one unassigned request.
- All **68 core tests pass**. Explicit core and web TypeScript checks pass. Production build passes.
- Code findings below are distinguished from visual observations. Live microphone capture, recovery, cloud fallback, PiP, screen-reader behavior, and responsive iframe layouts were not manually verified in this review. The handoff's real-voice assignment claim remains unproven.
- The browser session reset during the user's permissions refresh; visual observations refer to the session before that reset. No production deployment was performed.

## 1. Protect captured work and make claims accurate — P0

Do this before the visual pass. Approximate effort: 1–2 focused development days, plus live verification.

### Preserve a session through interruption

**Code finding:** `Record.tsx:55` resets `events.current` every time `begin()` runs. The “Share again” path calls it, despite saying “Nothing was lost” at line 186. Leaving the route stops the adapter, but no draft is saved. A disrupted meeting can therefore lose the text already collected.

Separate the meeting draft from the capture adapter. Resume into the same draft with unique event IDs and continuous approximate offsets. Offer “Save captured notes” when sharing ends. Checkpoint finalized transcript text locally; show recovery after refresh. If storage is unavailable, retain the draft in memory and offer an export. Keep interim text explicitly provisional; do not promote unstable speech merely to fill gaps.

**Acceptance:** capture A → stop sharing → resume → capture B → save contains both A and B once, in order. Refresh restores finalized text. Leaving a capture cannot silently discard it.

### Finish lifecycle cleanup

**Code findings:** microphone denial in `capture/live.ts:152` returns without releasing the acquired display stream. `start()` has asynchronous steps but no cancellation guard after them. `attach()` can report a start error before `start()` subsequently emits `running`. A queued restart callback does not recheck cancellation when it fires.

Give each start attempt a cancellation identity; check it after awaited work and in delayed callbacks. Clean up all resources on failed start. Transition to running only when startup has succeeded. Preserve `install() → start() → catch`, abort-first teardown, main-thread recognition, and stable-prefix finalization.

**Acceptance:** deny microphone, leave during installation, retry rapidly, and end during a scheduled restart: no surviving tracks or recognizers, stale callbacks, or false listening state. Add focused adapter lifecycle tests with controlled media/recognizer doubles, then verify in real Chrome.

### Make saving truthful

**Code findings:** meeting writes can reject; end-of-session writes and inline edits lack a recovery UI. Preferences display “Saved” before the asynchronous operation completes, while the storage helper swallows write failures. Reads also conflate inaccessible storage with an empty library.

Use explicit saving/saved/failed states. Keep unsaved notes available, provide retry and download, and distinguish “no meetings” from “cannot read this browser's storage.” Do not show success for a failed write.

**Acceptance:** simulated write failure leaves an exportable meeting and an actionable explanation; retry saves the same draft without duplication.

### Remove unsupported claims

**Code findings:** `Notes.tsx:110` hardcodes “You + 1 other” for every meeting. `App.tsx:80` supplies demo replay to every notes page. The landing says “85 seconds,” but the reviewed demo notes show 1:40. The capture page says both “Record a meeting” and “nothing is recorded.”

Use “Audio sources: your microphone + shared audio,” with no inferred attendee count. Show “Replay demo” only for demo meetings. Rename the live entry to “Start a meeting” or “Capture captions.” Derive demo duration from its script. State “On-device by default; cloud only with your permission” wherever an absolute local-only promise would contradict the existing consent path. Label the scripted demo so “Excerpt is listening” does not suggest the viewer's microphone is active.

**Acceptance:** live notes never imply saved audio, replay of a real meeting, identified attendees, or a privacy guarantee inconsistent with the selected processing mode.

## 2. Put the evidence interaction at the center — P1

Approximate effort: 1–2 days, after draft and save behavior is stable.

### Tighten the notes hierarchy

**Visual finding:** six stacked metadata rows, large margins, and a preferences nudge consume the first viewport. The first useful note arrives late.

Keep the title, but condense credits into a short responsive block. Place decision/action/review counts and export near the title. Reduce the masthead gap. Move the preferences nudge after the initial notes or into a small secondary control. Show a clear “No structured notes found” state when a transcript contains no qualifying sentences; explain conservative extraction without inventing filler.

**Acceptance:** at 1280×720, a typical meeting shows its first note and evidence affordance without scrolling.

### Keep a note and its source together

**Observed and code-backed:** strip selection frames a note, while clicking its quote scrolls much farther down to the transcript. Quotes are clickable blockquotes without keyboard semantics. Titles themselves do not select the note.

Make each note's selection and “View passage” action explicit and keyboard accessible. On roomy screens, use a notes column and an adjacent transcript pane; on narrower screens, expand a short source passage inline with a “Full transcript” link and return path. Selection should synchronize note, strip, and transcript. Use the same corner-frame treatment for the selected source passage.

Keep verbatim evidence visible. Avoid duplicating the full title as the only visible proof when surrounding context would explain a classification better. Do not imply playback or word-accurate seeking.

**Acceptance:** pointer and keyboard users can select a note, inspect its passage, and return to the note without losing their place. All visible timing remains approximate.

### Complete correction without inventing ownership

**Code findings:** title, category, assignment, and dismissal are editable, but due dates and decision states are not. “Assign to me” is offered on every category. Category changes preserve potentially irrelevant fields. `Notes` snapshots its initial meeting, which can leave item ordering stale when preferences arrive later. Export uses its own category order and counts all decided-state items as decisions.

Offer due-date and decision-state correction where relevant. Limit task assignment to actions; normalize fields when recategorizing. Preserve original evidence and mark user edits. Recompute ordering from current items and preferences without overwriting edits. Keep the exported counts, states, order, and edited provenance consistent with the UI. Either include real transcript anchors in Markdown or describe its evidence as quoted passages rather than links.

**Acceptance:** correct an item, reload, change preferences, and export: the changes persist, ordering agrees, original evidence remains intact, and a remote request remains unassigned unless explicitly corrected by the user.

## 3. Improve first impression and legibility — P1

Approximate effort: 1–2 days. Preserve the existing design language.

- **Landing:** move the demo and live CTAs directly below the lede. Follow with a compact real example: one extracted note, its quote, and a source affordance. Keep the three explanatory claims below this immediate proof. Reduce the 132px top padding at desktop heights where it hides the entry point.
- **Readable chrome:** lighten essential navigation, metadata, instructions, and controls. The current `--faint: #5A5A5A` is used extensively on `#0A0A0A`, often at 11px. Keep mono for labels, but use readable sans prose for longer setup explanations. Measure contrast and inspect at normal laptop brightness.
- **Semantic color:** ember currently also marks CTAs, speaking avatars, microphone levels, assignment, and generic hover states. Reserve it for the settled/selected meanings in the handoff. Use neutral contrast for ordinary interactions. Retain legible functional warnings, without adding decorative colors.
- **Capture setup:** order the flow as explanation → microphone check → source selection → start. The page currently requests microphone access immediately on arrival; request it from an explicit check/start action. Show a simple mic meter and headphone guidance for both source modes. Keep detailed device advice available next to the control.
- **Live view:** show clear setup, listening, silence, interrupted, and saving states. Replace the default wall of finals/interims/restarts/event traces with “Your mic: receiving audio” and “Shared audio: receiving audio.” Keep the current diagnostics in an expandable troubleshooting area.
- **Library:** support meeting renaming and distinguish demo entries from live meetings. Add a reversible delete experience and useful empty-state links to both demo and capture.

**Acceptance:** both landing actions are visible at 1280×720; important labels are readable; a new user can find mic setup and understand whether audio is arriving without knowing recognition terminology.

## 4. Accessibility, captions, and release proof — P1

Approximate effort: 1–2 days, including hands-on checks.

**Code findings to fix or verify:**

- The skip link changes the hash to `#main`, which the router treats as the landing route. Focus main content without changing routes.
- Strip scrubbing is pointer-only. Provide keyboard navigation and meaningful approximate-position announcements; enlarge mark hit targets without thickening the visual ticks.
- Label the title editor, category selector, and preferences textarea. Keep correction controls discoverable on touch devices of any width, not just screens below 720px.
- Honor reduced motion for evidence scrolling as well as caption/strip transitions.
- Caption typography is scoped to `.call .caption`; standalone PiP captions are outside `.call`. Share the caption styles directly, carry contrast state into PiP, and close owned PiP windows when the session ends.
- Overlap handling joins each speaker's broken lines back into a long line. The reviewed demo showed three rendered lines, exceeding the two-line motif. Define a bounded visible caption window for overlap and continuous speech, preserving the full finalized transcript.
- The caption live region is recreated on every text change, including interims, despite the comment promising settled announcements. Use a stable region and a separate final-text announcement policy; verify with a screen reader.
- Narrow `.actions` rows do not wrap. Exercise export buttons, recovery screens, long titles, and editing at actual iframe widths.

**Release checklist:**

1. Recheck the nav build timestamp after every restart/deploy; retain an accessible timestamp on narrow layouts too.
2. Use sized iframes at 360, 390, 768, and 1280px for responsive checks. No page overflow or clipped captions; no narrow-headless-window assumptions.
3. Complete demo → evidence → correction → export → library → reopen with keyboard and pointer.
4. Test tab audio and system audio in real Chrome on macOS. With headphones, run the handoff's spoken decision/first-person commitment/remote-request scenario. Verify one action assigned to you and an ambiguous request left unassigned.
5. Test interruption/resume, denied permissions, silent microphone, storage failure, and departure during startup. Confirm resource release and draft retention.
6. Check PiP legibility/contrast/lifecycle and listen to the optional ambient bed. Do not treat automated measurements as listening verification.
7. Keep all extraction guards and 64 existing tests passing; add targeted lifecycle, persistence, correction/export, and keyboard journey coverage. Rerun both explicit TypeScript checks and production build.
8. After a separately authorized release, verify the public production URL and its new build timestamp. A git push alone does not deploy this project.

## Execution order and boundaries

Ship in four reviewable batches: **capture integrity → evidence and correction → visual hierarchy → accessibility and real-device proof**. Estimated total is 5–8 focused days; browser-specific failures may extend the verification work.

The first batch should resolve transcript loss on re-share, save recovery, failed-start cleanup, and unsupported attendee/replay claims. These are more consequential than decorative refinement and establish the foundation for the polish pass.

No LLM, backend, account system, integrations, recording, inferred speakers, or broader extraction is needed. Preserve conservative matching and the hard-won capture behavior in `CONTEXT.md` throughout.
