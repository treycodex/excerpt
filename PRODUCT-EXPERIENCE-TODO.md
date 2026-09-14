# Excerpt product experience — top-three implementation plan

Created: September 13, 2026.
Status: **P1, P2 and P3 implemented and validated locally on September 13, 2026.**
Not deployed. See the completion record at the end.
Audience update: agency-side creative, media, performance, and account teams;
see [AGENCY-PRODUCT-INTENT.md](AGENCY-PRODUCT-INTENT.md). This updates P3's
positioning and examples without adding implementation scope beyond the top three.
User request: make a full plan for the top three product-audit opportunities and
remember them as to-do work. This request authorizes planning and saving this
document; it does not start implementation or deployment.

## Scope and intended result

Only these three opportunities belong to this plan, in this order:

1. Show completed notes before optional setup.
2. Make enhancement controls match actual capabilities.
3. Lead with visual meeting memory.

Audit opportunities 4–10 are explicitly excluded. In particular, this plan does
not redesign the notes recap, evidence viewer, interactive demo, commitment
reconciliation, capture health, installation, or library search. A static product
image for the landing page is in scope; a new interactive sample is not.

The result should be a coherent promise and first-use journey: understand what
Excerpt helps you remember, reach its current notes without an unrelated detour,
and see controls that accurately describe what this environment can do.

Evidence baseline: current working-tree implementation and local browser audit on
September 13. Existing uncommitted changes belong to the ongoing product work;
inspect the current diff before implementing and preserve them. Recheck behavior
before applying this plan because the native notes provider is under active work.

## 1. Show notes before optional setup

### Problem and evidence

On a fresh browser, both demo completion and “Skip to notes” run App.onEnd, which
checks `excerpt:welcomed` and routes to `/welcome/:id`. The next screen asks users
to select subtitle style and priorities before seeing the output they requested.
Browser capture entry also routes through this personalization wizard before
audio setup. Neither personalization choice is required to capture or read notes.

Relevant files: `apps/web/src/App.tsx`, `router.ts`,
`views/Onboarding.tsx`, `views/GetStarted.tsx`, `views/Preferences.tsx`,
and `views/Notes.tsx`.

### Product decisions

- Demo completion and “Skip to notes” open the saved meeting directly.
- Browser capture entry opens the existing audio setup in Record directly.
- Personalization stays optional and remains available through Preferences.
- Do not alter native microphone, screen-recording, speech-permission, or model
  preparation gates. Necessary capture setup is separate from personalization.
- Keep existing style and priority preferences; do not reset them during migration.

### Intended flow and copy

`Demo → completion or Skip to notes → Notes`

`Get Started → Set up meeting audio → existing Record setup`

In completed notes, show one small, nonmodal hint below the reading content:
“You can change subtitle style and review priorities in Preferences.” Actions:
“Preferences” and “Dismiss.” Do not add a third onboarding step or automatically
open the hint. Return users to the same meeting and retain edits if they visit
Preferences. Suppress the hint for previously welcomed users or after dismissal.

If Preferences does not expose both settings in the current implementation,
bring the existing controls there before removing the wizard from the default
journey. Describe priority matching as ordering review items, not improving prose.

### Implementation checklist

- [x] Trace demo save success/failure and remove only the optional setup routing.
  `App.onEnd` now always opens `/m/:id`. The `excerpt:welcomed` flag is still read,
  but only to suppress the new hint for people who already walked the wizard.
- [x] Preserve the in-memory meeting and existing save-failure/export behavior.
  `setMeeting(m)` still precedes the navigation, and App's meeting effect still
  returns early when the in-memory meeting already matches the route, so a refused
  write does not turn into “No such meeting”.
- [x] Point the browser entry CTA at Record and label it “Set up meeting audio.”
- [x] Make existing `/welcome/:id` links open that meeting without the wizard.
- [x] Make old `/setup` links reach audio setup so bookmarks remain useful.
  Both are handled in `router.parse` with `history.replaceState`, which adds no
  history entry, so back does not bounce off the old link. `apps/mac/DISTRIBUTION.md`
  was updated to stop pointing at `#/setup`.
- [x] Retain and expose both personalization settings in Preferences.
  No migration was needed: Preferences already held subtitle style, category order
  and the priority instruction. Nothing was reset.
- [x] Add the dismissible hint and a safe return link to the originating meeting.
  The hint records the meeting id in `sessionStorage`; Preferences reads it once,
  clears it, validates the id shape, and only renders the link after `loadMeeting`
  confirms the meeting still exists.
- [x] Persist dismissal best-effort; if storage is unavailable, dismiss for the
  current session without blocking notes or showing a storage error for the hint.
  First implementation only dismissed it for the current *view*: `Notes` remounts on
  every return to the meeting, and a refused write meant the hint came back. A
  module-level session flag now carries it, verified with `setItem` throwing.
- [x] Ensure preference failures offer retry/cancel without stranding the user.
  A refused `savePreferences` keeps the edit on screen and offers Try again / Cancel.

Also fixed on this path, because it broke the acceptance item below: the demo's
natural ending saved the meeting **twice**. `Session.finish` ran on more than one
100 ms tick while the asynchronous `onEnd` was still reading preferences and
writing, so the library showed two copies of the same demo. Pre-existing —
`Session.tsx` was untouched by this work and the old `onEnd` was equally
asynchronous — and now latched with a ref so it runs once.

### Acceptance and validation

- [x] With fresh storage, “Skip to notes” reaches Notes with no intermediate wizard.
  Cleared `localStorage`, `sessionStorage` and the `excerpt` IndexedDB; Skip landed
  on `#/m/m-1789274632216` with the notes rendered.
- [x] Letting the demo finish produces the same route and result. Ran the scripted
  demo to its natural end twice: `#/m/m-1789274926239`, and exactly one key in the
  `meetings` store (two, before the latch above).
- [x] Existing users retain their style, priorities, and saved meetings. Seeded
  `excerpt:welcomed=1`, the `warm` caption preset and a stored `Preferences`; after
  reload the preset, the reordered categories, the instruction, the `launch` boost
  chip and the saved meeting were all intact, and the hint stayed hidden.
- [x] The browser capture CTA reaches microphone/audio setup in one navigation.
  “Set up meeting audio” → `#/record` → “Capture a meeting”.
- [x] Old welcome/setup links have useful destinations; back navigation does not loop.
  `#/welcome/<id>` → `#/m/<id>` on that meeting; `#/setup` → `#/record`; two
  successive backs settled on the meeting rather than re-redirecting.
- [x] Optional preference loading, saving, or storage failures never block notes.
  With `IDBObjectStore.prototype.put` patched to throw — a browser with site data
  blocked — Skip still reached the notes, the document rendered in full, the toolbar
  read “Not saved — export a copy”, and Copy/Markdown/Export stayed available.
- [x] Dismissal remains effective across reload when storage is available.
- [x] Native capture still enforces its existing readiness requirements. `#/setup`
  was a browser-only personalization wizard, and the Mac's own permission and model
  gates live in `Setup/` and are unchanged. **“Nothing native was touched” was too
  strong**, and was corrected: `build:notes` compiles this same app into the Mac's
  notes window, so the new hint shipped there too — pointing at a subtitle-style
  control that writes to the webview's storage and cannot move the Mac's overlay.
  The hint is now suppressed under `isNativeHost()`.
- [x] Add focused route/flow regression coverage for fresh-user completion and old
  links; manually inspect keyboard focus and browser back behavior.
  `apps/web/src/router.test.ts` — 5 cases covering `/m/:id`, the two legacy links,
  an id-less welcome link, and the routes the rest of the app links to. Keyboard:
  the hint's Preferences link and Dismiss button both take focus and sit outside
  the `notes-editor` fieldset, so neither is disabled while a refresh is running.

Success signal: zero optional screens between demo completion and notes; no
required personalization decisions before browser audio setup. Measure with
scripted local checks, without introducing analytics infrastructure.

Estimated effort: **0.5–1 engineering day**, including validation.

## 2. Make enhancement controls match actual capabilities

### Problem and evidence

Notes renders “Improve notes,” “Shorter,” and “More detail” for completed meetings.
The requested style reaches only `bridge().summarizeNotes`. Without that bridge,
all three actions run the same extractive refresh. During the audit, “Shorter”
returned the same thirteen excerpts. The interface only explains the native
capability after the user has clicked, and unchanged output still gets a preview.

Relevant files: `apps/web/src/views/Notes.tsx`,
`packages/core/src/store/bridge.ts`, `packages/core/src/notes/editor.ts`,
`packages/core/src/notes/summary.ts`, and, only if needed for capability reporting,
native `NotesBridge.swift` and `NotesProvider.swift`.

### Capability and state matrix

| Environment/state | Visible actions | Feedback |
| --- | --- | --- |
| Browser, transcript available | Refresh excerpts | “Uses your transcript to rebuild excerpts. Your writing and images are kept.” |
| Native, selected enhancement provider ready | Improve notes; Shorter; More detail | Name the selected provider/processing mode accurately. |
| Native, provider unavailable or not configured | Refresh excerpts; link to existing provider settings | Explain what is unavailable before an enhancement request. |
| No transcript | No enabled generation action | “Add notes or images now. Generated excerpts need transcript text.” |
| Live draft | Keep existing live-draft behavior | Do not add post-meeting regeneration during capture. |
| Request running | Disable duplicate generation requests | “Refreshing excerpts…” or “Improving notes…” according to the action. |
| Output unchanged | No replacement preview | “Your excerpts are already up to date.” or “No wording changes were produced.” |
| Request failed | Retry; explicit local refresh where applicable | Keep current notes and explain the failure. |

The presence of a native bridge does not alone prove that a provider is ready.
Reuse current provider state if exposed; otherwise add the smallest read-only
capability response necessary. Do not make a paid generation request to probe it.
Do not implement a browser AI provider, new models, or new note-generation styles.

### Implementation checklist

- [x] Derive the available actions from actual environment/provider capabilities.
  `notesCapability` in `packages/core/src/notes/generation.ts`, called before the
  toolbar is drawn. It treats “a bridge exists” as *not* proven ready.
- [x] Replace browser enhancement buttons with the single “Refresh excerpts” action.
- [x] Put the browser/native capability explanation before the action, not solely
  in its completion message. Avoid claiming all Mac summaries run on-device.
  The sentence sits under the provenance line and before the buttons in DOM order,
  and the OpenAI case says “sends your transcript to OpenAI gpt-5-mini”.
- [x] Preserve native style requests when a working selected provider supports them.
- [x] Separate generation failure from a successful local refresh. Do not present
  fallback excerpts as if the requested enhanced rewrite succeeded.
  A failed `summarizeNotes` now sets an error block; it no longer falls through to
  `setGeneratedDraft(refreshMeetingNotes(...))` in a `finally`.
- [x] Compare the candidate document users would actually apply with the current
  document after edit-preservation rules. Ignore generated IDs and timestamps;
  compare text, order, block kinds, evidence, and meaningful review state.
  `mergeGeneratedNotes` then `compareNotesDocuments`, both in core and unit-tested.
- [x] If nothing meaningful changes, show a status message without replacement UI.
- [x] If only source/review metadata changes, say so explicitly rather than claiming
  “new wording”; preserve a review/apply path when the change requires consent.
  The preview becomes “Review the updated sources” / “Update the sources”.
- [x] Keep changed-output previews and explicit application. Protect handwritten
  text, user-edited generated blocks, images, and image positions.
- [ ] Protect **deleted content**. It is not protected, and was wrongly checked here
  at first. A block the reader removed comes back on the next Refresh excerpts,
  appended at the end rather than in its old place. Distinguishing "deleted" from
  "never produced" needs a tombstone the document does not carry, which is a data
  change rather than a fix. The restore is at least visible: it appears in the
  preview, and nothing is applied without consent.
- [x] Ensure stale requests cannot apply over a newer document/source revision;
  reuse current revision protections rather than inventing another persistence path.
  A request records the meeting id and `sourceRevision`; both are rechecked when it
  lands *and* again at accept time, and the candidate is re-merged against the
  document as it stands then, so edits made while a preview is open survive.
- [x] Keep the last saved document available after errors and avoid duplicate requests.

Native side, the smallest read-only capability response: `NotesProviderStatus` gained
`selected`, `ready`, `reason`, `providerName` and `processing`, answered by
`NotesProviderCoordinator.status` from `SystemLanguageModel.default.availability` and
a Keychain existence check. No request is made to probe a provider. Every new field
is optional in the TypeScript type, so an older app build that reports only
`openAIKeyConfigured` degrades to “not proven ready” rather than to “ready”.

### Acceptance and validation

- [x] Browser never offers “Shorter” or “More detail” without implementations.
  In the running app the browser toolbar reads “Refresh excerpts” and nothing else.
- [x] Refreshing an unchanged sample yields an unchanged-status message, no preview.
  “Your excerpts are already up to date.”, no preview section in the DOM.
- [x] A changed extractive result offers an accurate preview before application.
  Removed a bullet, refreshed: preview restored it *and* showed the reader's own
  edited bullet in place, which is the document they would actually get.
- [x] Native style requests still pass the correct balanced/shorter/detailed value.
  Checked against an injected bridge that echoes the requested style; “Shorter”
  produced the shorter-marked document.
- [x] Missing provider, authentication failure, timeout, and network failure retain
  current notes and expose an actionable retry/settings route.
  All four checked: no-key and model-unavailable render the explanation plus a
  settings link and only “Refresh excerpts”; timeout, invalid key and network
  failure each left the document byte-identical and offered Try again / Refresh
  excerpts instead / Note enhancement settings.
- [x] Local fallback requires an explicit user action after a provider failure.
- [x] Empty and live meetings do not suggest unavailable generation work.
  Empty: no buttons, “Generated excerpts need transcript text.” Live draft: the
  toolbar shows only “Live draft · saved as you write”, as before.
- [x] Evidence-only changes are not accidentally discarded as identical output.
  Unit-tested, and exercised in the app with a provider returning identical text
  and one extra cited event id — it produced the sources-only review path.
- [x] User writing and image position survive refresh, failed generation, and preview.
  Pasted a screenshot at 0:30 (block index 3), edited a bullet by hand, removed
  another, then refreshed and applied: image still at index 3, handwritten wording
  intact. **This check passed while a serious defect went undetected — see the
  independent review section below.** It was fixed and is now covered by tests.
- [x] Add focused capability, unchanged-output, and preservation regressions; use
  mocked provider failures for deterministic checks, not real paid requests.
  `packages/core/src/notes/generation.test.ts` — 11 cases. No request was made to
  any paid provider at any point; the native path was exercised through an injected
  bridge double in the browser.

Success signal: each displayed action has a distinct implemented outcome or an
accurate unchanged/error explanation, with zero misleading replacement previews.

Estimated effort: **1–2 engineering days**, including provider-state integration
and validation. The browser-only labeling correction is the smallest first slice.

## 3. Lead with visual meeting memory

### Problem and evidence

IMPLEMENTATION-PLAN.md defines the job as remembering what was said and what was
on screen during agency creative, media, and reporting reviews. Landing.tsx instead leads with “Meeting
notes. Cinematic feel. Free. Open source.” over a coastline. The page emphasizes
captions and extracted categories before demonstrating visual context. Get Started
and native welcome copy repeat the earlier generic meeting-note positioning.

Relevant files: `apps/web/src/views/Landing.tsx`, `landing.css`,
`GetStarted.tsx`, `apps/web/index.html`, marketing assets under `public/`,
`apps/mac/Sources/Excerpt/Setup/SetupView.swift`, and the README introduction.

### Proposed message hierarchy and working copy

1. **Job:** remember the reviewed screen and the conversation together.
2. **Audience:** agency-side creative, media, performance, strategy, and account
   teams reviewing campaigns, creative work, and reports on a shared screen.
3. **Proof:** a real Excerpt document showing a sample campaign report and creative
   asset beside their discussion, with an editable note of the agreed next action.
4. **Support:** captions, optional Catch Up, local storage, source inspection,
   editable notes, and export, accurately qualified by platform.
5. **Reassurance:** free/open-source core, no account, and explicit optional cloud use.

Hero eyebrow: “FOR CREATIVE AND MEDIA AGENCIES”

Hero headline: “Keep the creative, the numbers, and the conversation together.”

Hero body: “Turn creative reviews, performance reports, and client feedback into
editable meeting notes—with the screens and discussion behind each next step.”

Support the headline with explicit capture/paste wording. “The numbers” means
retaining the report view and its spoken discussion; it must not imply automatic
report reading, metric verification, spreadsheet/PDF import, or ad-platform access.

Primary CTA: “Use Excerpt” → existing Get Started.
Secondary CTA: “Try the meeting-notes demo” → existing scripted demo.
Nearby expectation: “Scripted browser demo · no account or permissions needed.”
Do not imply that the existing interactive demo demonstrates screenshot capture.

**Note on timing.** This section was rewritten from design/product reviews to
creative and media agencies while implementation was in progress, alongside the new
`AGENCY-PRODUCT-INTENT.md`. P3 was first built to the earlier text and then rebuilt
against this one; nothing from the earlier version survives in the page or the
assets. P1 and P2 were unaffected, as that document says they should be.

### Page and asset plan

- [x] Replace the dominant scenic hero with a legible product visual; retain the
  existing typography and restrained cinematic identity where it helps reading.
  The coastline is gone from the hero. It is still used behind the subtitle-style
  previews in Preferences and in the Mac setup, which is the one place a busy
  photograph is the point, so the file and its credit stay.
- [x] Use non-sensitive, explicitly labeled sample content in the current app:
  a campaign report view with readable period/metric labels, the relevant creative
  asset, surrounding speech, and an editable note of the agreed next action.
  The report carries client, channel, `1–30 Sep 2026`, currency, the metric column
  headers, a filters line, and the words “Synthetic sample data, drawn for this
  screenshot. Not a real campaign.” inside the picture.
- [x] Label the asset “Sample agency campaign review in Excerpt.” Do not imply live capture
  or display functionality that the current app cannot perform.
- [x] Keep explanatory annotations outside the captured app UI. Show the product
  rather than fabricating an improved recap or evidence panel from excluded work.
  Nothing is drawn over the screenshots; the only caption is outside the frame.
- [x] Add a short workflow section: capture/paste a screen → keep discussion beside
  it → edit and revisit the resulting notes. State that native region capture uses
  a shortcut; browser image import/paste is a different workflow.
- [x] Move captions into a supporting role without removing their demonstration.
  The film section is now third, under “And while it happens, subtitles.”
- [x] Rework repeated generic claims into specific benefits and avoid unsupported
  exclusivity or “replaces everything” competitor claims. “A free, open-source
  alternative to Granola and Tactiq” is gone.
- [x] Align Get Started and native welcome language with the same job; preserve
  their functional setup flows and existing availability constraints. The
  comparison table gained a “Screens in your notes” row that states the shortcut
  and the paste workflow separately; no setup step changed.
- [x] Update document title, description, social-card text/assets, image alt text,
  and README introduction so shared links repeat the same promise.
- [x] Review privacy/cost language against current native provider settings:
  optional BYOK notes are distinct from local transcription and can incur charges.
  The old “Private by default” principle became two: transcription stays local,
  and rewriting is optional and says plainly that the OpenAI path sends transcript
  text to OpenAI and is billed to the reader.
- [x] Keep screenshot context claims precise: nearby speech gives context, not proof
  that every sentence describes the image. Do not imply retained audio or OCR.
  The workflow section says it in the page: a captured report is kept as a picture
  and the conversation as a transcript, and Excerpt does not read numbers off a
  report, verify a metric, import spreadsheets or PDFs, or reach an ad platform.

Both stills are regenerated from the running app by a new developer tool,
`apps/web/tools/render-product-shot.mjs`. It seeds a sample meeting whose items are
extracted by the real engine, pastes the two sample screens through the document's
own paste handler, places them on the meeting clock through the product's own
placement panel, captions them in the product's own fields, writes the agreed next
action as a new block, then **reloads** and shoots — so the picture is of what was
actually saved. The old `notes.png` showed a two-tab notes view the app has not had
since the Review tab landed; a screenshot that no longer matched the product is
exactly what this opportunity exists to fix. While regenerating the social card, a
latent bug in `render-brand.mjs` surfaced: it waits for the output file to exist, so
a second run found the previous `og.png` already there and silently shipped the old
card. Fixed by removing the output before shooting.

The sample speech was chosen against the real extractor, not written and hoped for.
“Let's test a clearer opening line” yields nothing; “let's go with a clearer opening
line” is a decision. “I'll brief the new opening line before Thursday” is only a
deadline, because `brief` is not a commitment verb the engine knows; “I'll write the
new opening line before Thursday” is an action assigned to you. The page shows what
the engine actually produces.

### Acceptance and validation

- [x] At desktop and narrow widths, the first screen communicates audience, job,
  product proof, and a useful CTA without depending on hover or video playback.
  **Originally recorded as passing on a measurement that only covered the hero's own
  height, not its position on the page.** The masthead wordmark above it was 380px
  tall at 1440×900, so the lead, both calls to action and the demo expectation line
  were 90–420px *below* the fold. Fixed by capping the wordmark at 25% of viewport
  height and top-aligning the hero's two columns instead of centring the shorter one
  against the taller. Re-measured at exactly 1440×900: eyebrow and headline 453–626,
  lead 646–730, “Use Excerpt” 756–810, “Try the meeting-notes demo” 830–847, the
  scripted-demo line 859–897, and the top 500px of the screenshot — all inside 900.
  A second review measured this again at other sizes: at 1280×800 and at a
  chrome-realistic 1440×760 the eyebrow, headline, lead, primary CTA and the top of
  the product shot are still above the fold, but the secondary link and the
  scripted-demo line are not. The criterion names "a useful CTA", which holds
  everywhere tested; the stronger reading of the original note did not.
  Also checked at 768 and 375; there is no video in the hero at all.
- [x] A static image and meaningful alt text carry the message with motion disabled.
  The alt text names the report, its period, the spoken click-through comparison,
  the creative, and the typed agreement.
- [x] Product screenshots remain readable; use a deliberate crop at small widths.
  The stills are captured from a deliberately narrow, tall window so the hero lands
  at ~60% of native size at 1440. Under 680px the image is oversized to 175% and
  clipped to its top-left, which shows less at a readable size rather than the whole
  document at a third of it.
- [x] Primary and secondary CTAs lead to their named existing experiences.
  “Use Excerpt” → `#/get-started`; “Try the meeting-notes demo” → `#/session`,
  which is the scripted demo the line beneath it describes.
- [x] Mac/browser differences, availability, and optional cloud processing are accurate.
- [x] Creative, media, and client-reporting examples are recognizable to agency users;
  report imagery does not imply unimplemented import, OCR, or analytics features.
  Recognizable is a claim about people and is **not** evidenced — see the unchecked
  item below. What was checked is the second half: the page states the limits.
- [x] No new feature is required to make the page's promises true. Every claim is
  either visible in the screenshots or was exercised during P1 and P2.
- [x] Check keyboard navigation, text contrast, image loading/fallback, and social
  metadata. Both hero images load (`naturalWidth` 1648); no horizontal overflow at
  375, 768 or 1440; the figure caption was darkened from `#6d7061` to `#54574a` to
  clear 4.5:1 on paper; title, description, `og:*` and `twitter:*` all updated, and
  `og.png` re-rendered with the new line.
- [ ] Run a lightweight comprehension check with three agency-side target users.
  **Not done — no participants were available in this session.** Nothing on the page
  is user-validated; the positioning is an argument, not evidence.

Success signal: visitors describe the visual-review job, and the existing demo
matches the narrower expectations its CTA sets. No conversion lift is assumed.

Estimated effort: **1–2 engineering/design days**, plus participant availability.

## Execution order and completion record

- [x] P1: Direct notes and capture entry, optional preferences, route validation.
- [x] P2: Browser controls first, then native capability states and honest previews.
- [x] P3: Message hierarchy, real product visual, supporting copy and metadata.
- [x] Integrated check: fresh browser → landing → current demo → immediate notes →
  refresh unchanged excerpts → optional preferences → return to the same meeting.
  Run end to end on cleared storage: landing (“Keep the creative, the numbers, and
  the conversation together.”) → the demo via its own CTA → Skip to notes landed on
  `#/m/m-1789277046929` with no wizard → Refresh excerpts said “Your excerpts are
  already up to date.” with no preview → the hint's Preferences link → both settings
  present, a caption preset and a priority instruction saved (“campaign”, “launch”,
  “deadlines”) → “← Back to your notes” returned to the same meeting with its title,
  its 13 blocks and the new preset in effect.
- [x] Validate existing type/build checks appropriate to changed files and the focused
  behavioral regressions above; run native checks only if native behavior changes.
  `@excerpt/core` vitest 128 passed (117 before, 11 new); `@excerpt/web` vitest
  5 passed (new); `tsc --noEmit` clean for core and web; `vite build` succeeded.
  Native behavior did change — `NotesProviderStatus` and `NotesBridge` — so
  `swift build` and `swift test` were run: 113 tests passed.
  Both generated Mac inputs were regenerated afterwards, because the webview bundle
  in `apps/mac/Resources/notes/` predated all of this work and the Mac window would
  otherwise have kept showing the old notes toolbar until someone ran `build.sh`:
  `pnpm --filter @excerpt/web build:notes` and `pnpm --filter @excerpt/core
  build:engine`. Both are gitignored build outputs, so neither appears in the diff.
  The engine build also re-ran its own guard — it exits non-zero if `idb-keyval`,
  `indexedDB`, `window.` or `document.` reach the bundle — which confirms the new
  `notes/generation.ts` stayed out of the engine's import graph.
- [x] Inspect final diff for accidental inclusion of audit opportunities 4–10.
  Nothing in the diff touches the recap layout, the evidence viewer, the interactive
  demo's content, commitment reconciliation, capture health, installation, or
  library search. Three changes are adjacent and deliberate, each recorded above:
  the demo's double-save latch (P1's own acceptance criterion), the regenerated
  `notes.png` (a screenshot that contradicted the product), and the `render-brand`
  stale-output fix (found while regenerating the social card P3 asks for).
- [x] Record completed items, checks, remaining limitations, and any revised estimate
  here. Leave unfinished validation explicitly unchecked.

### Independent review, and what it found

After implementation, a separate agent was asked to read the diff and try to break
these acceptance criteria without changing anything. It found a genuine data-loss
bug that every check above had missed. Everything below was fixed and re-verified
unless it says otherwise.

**Fixed — note loss in the main P2 path.** `mergeGeneratedNotes` built a set of every
transcript event id cited by any protected block and dropped *all* incoming wording
touching one of them; current blocks left without a counterpart were then deleted.
One transcript event routinely yields several bullets, and — because of a change
already in the tree that gives a heading its whole section's evidence — a heading
cites every event under it. So editing one bullet silently deleted its siblings, and
editing a heading deleted its entire section, behind a preview that read “Your
writing and images are kept”. Reproduced on the shipping demo: edit one bullet,
Refresh excerpts, and a 13-block document became 12 with no mention of the loss.
The merge now pairs each block with exactly one counterpart, which keeps the
no-repetition property without taking anything else with it. Three regressions were
added, including the heading case and the several-bullets-per-event case the original
test's fixture structurally could not express. Re-verified in the browser: the same
edit now reports “Your excerpts are already up to date.” and loses nothing.

**Fixed — a browser was still offered a note-enhancement provider it does not have.**
Preferences rendered the Apple/OpenAI picker and the sentence “Screenshot pixels stay
on this Mac” in a plain browser tab, which is P2's own problem statement, in the
screen P1 now routes readers to. The browser gets one accurate sentence instead.

**Fixed — an identical-wording provider rewrite reported “no changes”.**
`compareNotesDocuments` only looked at blocks, so a cloud rewrite that landed on the
same sentences discarded its own provenance and left the toolbar reading “From your
transcript” after the reader had been billed. Document provenance is now part of the
comparison, and that case is offered as a sources-and-provenance change.

**Fixed — an unknown `processing` value claimed on-device.** `notesCapability`'s
ternary defaulted anything that was not `'cloud'` to “runs on this Mac”. It now
requires an explicit `'on-device'`; a host that does not say gets a sentence saying
it did not say.

**Fixed — Preferences “Cancel” after a failed save did not revert.** The refused
choice stayed on screen looking applied and silently reverted on the next load. It
now restores the last state storage confirmed.

**Fixed — `DISTRIBUTION.md` still described the removed flow** one line below the
line that had been corrected.

**Fixed — `Session`'s new latch could strand the demo.** It is set before the async
`onEnd`, whose preference read was unguarded; a throw would have left no meeting, no
navigation, and a dead Skip button. Ranking is now the only part allowed to fail.

**Not fixed, and why.**

- **Deleted blocks come back on refresh** — see the unchecked item in P2 above.
- **A ready Mac provider has no “Refresh excerpts” button.** The capability matrix in
  this plan specifies exactly that, so the behaviour is as authorized; the local
  rebuild is reachable only from a failure. Worth revisiting, as a reader whose
  document has been rewritten has no route back to transcript-based excerpts.
- **The reader's free-text instruction is passed into the summarizer prompt**
  (`NotesSummarizer.swift`, `NotesProvider.swift`), and the Preferences copy was
  changed to say so. This is pre-existing BYOK work, not part of these three
  opportunities, but it is the exact failure mode CONTEXT §10 records: one noun in an
  instruction became a fabricated heading, and headings are not quote-verified by
  `supported()`. §4 also says personalization is “ordering only, never filtering”.
  Flagged for a decision rather than changed here.
- **`media/meeting.{mp4,webm}` is still captioned “REAL PRODUCT FOOTAGE”** and is
  still the stale recording CONTEXT §6 owed-item 0 describes, showing letter avatars
  the app no longer draws. Re-shooting needs a person at the machine
  (`apps/mac/tools/record-media.sh hero`), so it stays owed.
- **`apps/web/package.json` gained `"test": "vitest run"` without adding `vitest` to
  its devDependencies.** It resolves from the workspace root today. Adding the
  dependency properly needs an install and a lockfile change.

Claims the review could not verify, and neither could this session: anything running
on a real Mac, and the natural 104-second demo ending saving exactly one meeting
(the latch was read and the Skip path measured instead).

### Second independent review, and what it found

The fixes above were then audited by a second independent agent, which reconstructed
the old merge and confirmed the three new regressions genuinely fail against it. It
found the first fix incomplete.

**Fixed — the pairing was still order-sensitive.** Replacing the global covered-id
filter with "first incoming block sharing a source" is only correct while the
document's order and the rebuild's order agree, and the ↑/↓ buttons exist so a reader
can make them disagree. Edit a bullet, move its neighbour above it, refresh: the
neighbour's replacement went to the wrong block, one note vanished, and a regenerated
twin of the reader's own edited sentence appeared beside it. Same root cause as the
first bug, one step further along. The pairing is now decided by fit rather than
position — every candidate pair is scored on shared sources, exact source match,
wording overlap and block kind, the best are assigned first, and each block is used
once. Position then only decides where the result sits, which is the reader's
business. This also fixes a second finding: a refresh used to silently revert a
reader's manual block order, because the merge re-imposed the rebuild's.
Re-verified in the browser on the exact sequence the review used to break it, and on
its style-change-and-move variant: nothing lost, nothing duplicated, order kept.

**Fixed — the metadata preview copy was false for the case the provenance fix added.**
One fixed sentence covered two unrelated changes, so a rewrite whose only difference
was who produced it was announced as "the linked transcript sources or review flags
differ" when neither had moved. `notesMetadataDifference` now says which half changed,
and the heading and button change with it.

**Fixed — an unknown `processing` value no longer licenses a request.** The earlier
fix stopped it *claiming* on-device but still offered the three buttons under a
sentence the reader could do nothing with. A provider that will not say where a
transcript goes now gets no enhancement buttons at all, an explanation, and the
settings link.

**Fixed — an orphan 1.5s timer could erase a failure notice.** The instruction field
commits on every keystroke, so a timer armed by an earlier success landed on a later
failure and removed its notice *and* both its buttons, leaving a refused edit on
screen looking saved. The timer is now cancelled and will only clear a `saved` state.

**Fixed — the ranking itself was unguarded.** Only the preferences *read* was caught;
`applyPreferences` walks `order` and `boosts`, and a stored record with either null
would throw after `Session`'s latch was already set. Now the unranked list is the
fallback.

**Also confirmed by the review, and left alone:** images can never consume a
counterpart (`imageBlock` always sets `evidence: []`); handwritten blocks are created
`userEdited` and so are protected; the Mac injects its bridge at document start, so
the hint never flashes in the notes window before being suppressed; no block can be
duplicated; `loadPreferences` already swallows every storage failure internally.

**A reported failure that was not one.** An image import appearing to hang on
"Adding…" turned out to be the harness: `HTMLImageElement.decode()` stalls while the
browser pane is hidden, and the import completed the instant the pane was rendered.
Image position through refresh and apply was then verified properly — still at block
index 4 across a delete, a preview and an application.

**Corrected here rather than in code:** the first-screen measurement holds at a
900-pixel *viewport*. The review measured 1280×800 and a chrome-realistic 1440×760,
where the primary call to action, the eyebrow, the headline, the lead and the top of
the product shot are all still above the fold — the acceptance criterion — but the
secondary "Try the meeting-notes demo" link and the scripted-demo line fall below it.
No horizontal overflow at any width tested, and the `min-width: 1800px` override
behaves.

### Third verification round, on an isolated tab

The earlier rounds shared one browser tab with a review agent, which produced at least
one reading I could not trust. This round ran on a tab opened for the purpose, with
every other tab closed, and with the pane rendered whenever storage or image decoding
was involved.

**Two harness artifacts, named so they are not re-reported as product bugs.** While
the Browser pane is hidden, Chromium stalls `HTMLImageElement.decode()` *and*
IndexedDB `open()`; both resolve the moment the pane renders. Separately, calling
`indexedDB.deleteDatabase()` immediately before `location.reload()` leaves a blocked
delete that wedges every later `open()` for that origin — self-inflicted teardown, not
product behaviour. Neither is a defect in Excerpt.

**P1/P2 — image, caption and writing, through all three stages.** One meeting, an
image pasted and placed at 0:30, captioned in the product's own field
("Paid social report, 1–30 Sep 2026 — Variant B underperforming"), a handwritten note
added after it, and an existing generated bullet hand-edited. Then:

| stage | image position | caption | handwritten note | hand-edit |
| --- | --- | --- | --- | --- |
| refresh (no other change) | block 3 | intact | intact | intact |
| refresh after a deletion, preview applied | block 3 | intact | intact | intact |
| full page reload | block 3, image rendered | intact | intact | intact |

The reload leg matters most: it proves this is what was persisted rather than
in-memory state. Worth recording, because it is not obvious: the caption a reader
types under an image is stored on the **note block**, not on `meeting.images[].caption`
— the stored image record keeps an empty caption unless the moment viewer is used.
Both survive, and the document is authoritative, but the two can disagree. Pre-existing
and out of scope; noted so nobody reads the empty field as data loss.

**Journeys re-checked because the newest fixes touched them.**

- Orphan timer: keystroke A saved, keystroke B refused 200 ms later. The failure
  notice and both buttons were still present 1.8 s afterwards — past the moment A's
  timer would previously have wiped them — and Cancel reverted the field from
  "campaign launch" to the confirmed "campaign".
- Native provider states, through an injected bridge double: on-device ready gives the
  three styles and names Apple Intelligence; cloud ready says "sends your transcript to
  OpenAI gpt-5-mini"; a provider that reports `ready` but no `processing` now gets **no
  enhancement buttons**, the explanation, and the settings link.
- Provenance-only rewrite: heading "Review how these notes are described", body "The
  wording is unchanged, and so are its sources…", button "Update the description" — no
  longer claiming sources or review flags moved.
- Demo natural end: reached the notes directly with 1 decision / 1 assigned to you /
  1 to assign. That run happened to land in the wedged-storage tab, which made it an
  accidental re-test of the storage-failure path: the notes rendered in full, the hint
  appeared, the toolbar was correct, and the banner honestly read "Not saved — export a
  copy".

**Left incomplete.** Re-counting saved meetings after the *second* `onEnd` change could
not be done, because the origin's database was wedged by the teardown described above.
That change only wraps `applyPreferences` in a try/catch and cannot affect how many
meetings are written; the one-meeting result was measured after the first `onEnd`
change and is not re-measured here.

### Landing validation, agency positioning

Measured on the isolated tab. No horizontal overflow at any width
(`scrollWidth === clientWidth` throughout).

| viewport | primary CTA | secondary CTA | above the fold |
| --- | --- | --- | --- |
| 1920×1080 | 814–869 | 889–905 | eyebrow, headline, lead, both CTAs, expectation line |
| 1440×900 | 748–802 | 822–839 | same |
| 1280×800 | 706–760 | 780–797 | eyebrow, headline, lead, both CTAs |
| 768×1024 | 683–737 | 757–774 | all of the above, figure begins at 860 |
| 375×812 | 527–581 | 601–618 | all of the above, image cropped to a readable 330 px band |

At 1280×800 the secondary link originally ended 5 px below the fold; the hero lead's
margins were trimmed by 8 px so it clears. The scripted-demo expectation line sits just
below the fold at 1280×800 and above it everywhere else.

- **First screen says who and what:** "FOR CREATIVE AND MEDIA AGENCIES" / "Keep the
  creative, the numbers, and the conversation together." / "Turn creative reviews,
  performance reports, and client feedback into editable meeting notes—with the screens
  and discussion behind each next step." / "SAMPLE AGENCY CAMPAIGN REVIEW IN EXCERPT".
- **CTAs open what they name:** "Use Excerpt" → `#/get-started` ("The work, the numbers,
  the conversation."); "Try the meeting-notes demo" → `#/session`, the scripted demo,
  which the line beneath it describes. Back returns to `#/`.
- **Keyboard:** tab order through the hero is Skip to content → wordmark → How it works
  → Open source → nav Use Excerpt → hero Use Excerpt → Try the meeting-notes demo. Both
  hero CTAs take focus; the editorial focus-visible outline rule is in place.
- **Reduced motion:** the hero contains **no video at all** — a static image with 363
  characters of alt text carries audience, job and proof. The one video is supporting,
  muted, poster-backed, has an explicit play/pause control, and pauses under
  `prefers-reduced-motion`; the media query is present in the stylesheet. The query
  itself could not be *emulated* in this harness, so the pause behaviour is verified by
  construction and code, not by observation.

### Mac: regenerated inputs versus an assembled app versus a running one

Three different claims, kept apart deliberately.

- **Regenerated:** `pnpm --filter @excerpt/web build:notes` and
  `pnpm --filter @excerpt/core build:engine`, after the last source change. Both are
  gitignored build outputs.
- **Assembled:** `./build.sh` ran to completion and produced `build/Excerpt.app`,
  signed with the existing "Excerpt Dev Local" identity — *not* ad-hoc, so no macOS
  permission state was reset. `tools/sync-caption-tokens.mjs --check` reports the
  caption tokens in sync. The bundle's own webview resources were then grepped and do
  contain the new capability copy ("Refresh excerpts", "did not say whether"), so the
  app that would launch carries this work rather than the stale bundle it had before.
- **Not verified:** the app was **not launched**. Nothing here exercises the real
  `NotesProviderCoordinator.status` against `SystemLanguageModel.availability` or the
  Keychain, the notes window against a real meeting, or any Apple Intelligence or
  OpenAI rewrite. That needs a running app with TCC grants and a person at the machine.

### P3 surfaces, audited rather than rebuilt

P3 was rebuilt against the agency direction in the previous round, when the plan and
`AGENCY-PRODUCT-INTENT.md` changed mid-implementation. This round re-read all three
documents — none had changed since — and audited every surface the plan lists rather
than rewriting work that was already correct:

| surface | state |
| --- | --- |
| Hero eyebrow / headline / body | the plan's prescribed copy, verbatim |
| Product imagery | `campaign-review.png` — report with client, channel, 1–30 Sep 2026, metric columns and a filters line; the Variant B creative; the spoken CTR comparison between them; the typed agreed action |
| Asset label | "SAMPLE AGENCY CAMPAIGN REVIEW IN EXCERPT" |
| Workflow section | capture/paste → discussion beside it → edit and revisit, with the Mac shortcut and browser paste stated separately |
| Limits stated on the page | does not read numbers off a report, verify a metric, import spreadsheets or PDFs, or connect to an ad platform |
| Get Started, native welcome, title/description/`og:*`/`twitter:*`, `og.png`, README | all agency-worded |
| Interactive demo | kept as-is and described as "Scripted browser demo · no account or permissions needed"; nothing claims it demonstrates screen capture |

A grep for the superseded design/product-review vocabulary across the web sources,
`index.html`, the README and the Mac setup returns nothing.

### Remaining limitations

- **No running Mac app was exercised.** The bundle now assembles and is signed, and
  its embedded webview carries this work — but it was never launched. Mac provider
  states were checked through an injected bridge double in the browser, plus
  `swift build` and `swift test`. The notes window reading a real
  `NotesProviderCoordinator.status`, and an actual Apple Intelligence or OpenAI
  rewrite, remain unverified.
- **No provider request was ever made**, by design: `status` answers from a local
  availability property and a Keychain lookup, and the failure paths were exercised
  with a stub. Nothing was billed to anybody.
- **The positioning has no user evidence.** The comprehension check is unrun.
- `Onboarding.tsx` is retained but now unreachable. The plan said to remove only the
  routing, so the component was left in place; deleting it is a separate cleanup.
- Nothing here has been deployed, and this record does not authorize deploying it.

Actual effort: roughly a day of implementation and validation, against the planning
estimate of 2.5–5 days — lower mainly because Preferences already held both
personalization settings and the native provider state was already half-exposed by
the in-flight BYOK work.

Planning estimate: **2.5–5 working days**, not a delivery commitment. Implement in
three reviewable increments. Publishing and release distribution are separate
actions, not implied by this saved to-do. No scheduled reminder has been created.
