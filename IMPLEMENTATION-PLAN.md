# Excerpt: visual meeting memory

Planning baseline: September 11, 2026. Target: The Build Games, September 30.
Status: Phases 1 and 2 implemented with automated validation on September 11. Their
native capture journeys still need the real-device acceptance runs described below.
Later phases remain proposed and must not be presented as shipped.

## Product decision

**Remember what was said—and what was on screen.**

Serve designers and product builders reviewing work on a shared screen. Their
concrete job is to leave a review with the relevant design, its discussion, and
agreed changes together in an editable document. Training and walkthroughs are
secondary validation cases, not separate products or modes to build out.

The switching hypothesis: an individual who currently uses Granola plus manually
collected screenshots can replace that workflow with Excerpt. Test this with real
people; originality alone does not establish that anyone will switch.

Primary competition target: Most Creative, supported by a complete, reliable
workflow. Most Polished depends on real-device proof and installation quality.
Best Replacement requires evidence that people can use the resulting notes without
reconstructing the meeting. No category is a promised outcome.

The cinematic identity comes from useful subtitles, a timeline of captured moments,
quiet framing, and restrained motion. Use plain control labels.

## What differentiates the product

Granola already supports editable enhanced notes, pasted/dropped images, source
inspection, and a live transcript. Do not present those as exclusive features.
Its documentation says transcript wording cannot currently be edited. The sources
reviewed do not establish an equivalent to Excerpt's proposed synchronized capture
workflow; absence from documentation is not proof of absence from the product.

Excerpt's proposed advantage is the complete interaction:

1. Capture a region while someone explains a design.
2. Keep the image's meeting timestamp and surrounding speech together.
3. Add a short personal observation, optionally marking a point of interest.
4. Finish with editable notes containing that image at its capture position.
5. Open the image to inspect the nearby conversation or correct its transcription.

Example: someone says “Keep this layout, but move the price above the button.”
The saved moment shows which layout they meant, the relevant passage, and an
editable note describing the change. It does not guess an owner.

Catch Up supplies immediate value during the call. The end review helps the user
resolve commitments afterwards. Neither requires a new AI chat interface.

## Scope and architecture decisions

- Ship the native Mac meeting workflow first. Reuse the shared editor, schemas,
  evidence UI, and exports. The public website must demonstrate this workflow in
  an explicitly labeled sample without requesting permissions or an API key.
- Keep a usable local path. Add one optional cloud notes provider through native
  code with credentials in Keychain. Provider/model selection follows a small
  quality comparison; do not expose an arbitrary endpoint or provider marketplace
  in the first release. Provider charges remain visible.
- Keep speech recognition and note generation as separate choices. Changing the
  notes model cannot fix missing transcript text.
- The model writes prose. Existing deterministic extraction supplies conservative
  review candidates; it does not verify arbitrary model claims or guarantee that
  all commitments were detected.
- Exact source quotes prove that quoted text exists, not that a paraphrase is
  accurate or the recognition matches the audio. Evaluate meaning separately.
- Chronological placement wins when topic grouping would move a screenshot away
  from its capture position. Users can move images deliberately; regeneration
  respects that choice.
- No retained meeting audio is required for the competition scope. Post-call
  retranscription remains a later option because it adds capture, retention,
  reconciliation, storage, and consent work.

This direction revises CONTEXT.md's old blanket “no API keys” restriction for an
optional notes service. It retains local defaults, explicit processing choices,
conservative assignment, and preserved user edits. Production copy must change
when the service ships; it must not promise everything always stays on the Mac.

## Existing foundation and missing work

| Foundation in the repository | Required refinement |
| --- | --- |
| Native captions and screenshot shortcut | Reliable live workflow and contextual capture feedback |
| Catch Up panel with reading-position preservation | Provisional recent speech, then reconciliation into final turns |
| Editable note blocks and image timestamps | Authoritative draft editable during native capture |
| Optional Apple note summarizer | User-guided document enhancement and one stronger optional provider |
| Screenshot placement and persistence | Stable surrounding-transcript links and moment navigation |
| Correction previews and review items | Regeneration that understands generated prose and source revisions |
| Library, Markdown and HTML exports | Verified image portability and complete round-trip journey |

The original Phase 1 gaps in NotesBridge and MeetingSession are now implemented:
the bridge reads and publishes live meeting snapshots, editor writes merge through
the native session, and the draft is checkpointed independently of settled speech.
NotesDocument's method field still only supports extractive/on-device. The current
correction path rebuilds affected text with extraction, so adding cloud prose still
requires a deliberate revision strategy. Do not silently turn an enhanced paragraph
into raw excerpts.

## Phase 0 — Measure the foundation (September 11–12)

1. Fix the fidelity harness's empty-output case, isolate configuration per
   transcriber, and distinguish opt-in measurements from ordinary unit tests.
2. Compare current Apple finalization against no periodic finalization and a
   pause-aware candidate. Keep the outcome with measured completeness and useful
   live behavior; 15 seconds is a threshold, not a maximum lag guarantee.
3. Use a training-video excerpt, a two-person screen review, and a technical clip.
   Include names, numbers, negation, corrections, and speech near stop. Use audio
   authorized for evaluation; fixture recording is distinct from product retention.
4. Compare source audio with what capture delivers to identify missing buffers,
   clock drift, resampling problems, or duplicated sources before blaming a model.
5. If Apple remains inadequate, benchmark one local challenger (Parakeet) and one
   cloud reference on identical audio. A production engine replacement is a
   conditional decision, not three integrations to ship.

Acceptance: report errors and finalization lag, not merely output word counts.
Target <=10% WER on clean reference clips as a diagnostic, with no unexplained
systematic omissions. Separately inspect every scripted critical name, number,
instruction and negation. Correctly preserved or explicitly unresolved critical
facts matter more than a good aggregate score. A failed gate triggers capture or
recognition repair and cuts optional polish work later.

Files: SourceTranscriber.swift, SpeechFidelityTests.swift, CaptureEngine.swift,
TranscriptAssembly.swift, MeetingClock.swift.

## Phase 1 — One draft from start to finish (September 13–15)

**Implemented in code:** live draft creation/navigation; authoritative native
merging; title, document and imported-image writes; atomic draft recovery; settled
snapshot publication; immediate end save; asynchronous, reviewable enhancement;
additive schema fields; and protection against screenshot/speech loss from stale
webview snapshots. TypeScript and Swift automated suites pass. The hands-on capture,
close/reopen, screenshot, interruption and repeated-End journey remains required
before this phase is considered release-proven.

Start Meeting creates a persistent draft immediately and opens a blank editor.
Users can close the editor and continue capturing from the menu bar. Existing
caption and screenshot shortcuts remain reachable.

- Make the native session the authority for meeting ID, capture state, events,
  images, document revision and user blocks.
- Extend NotesBridge with a scoped active-draft read/subscription and block-edit
  operations. Never let a stale whole-document save overwrite newer speech or images.
- Journal user writing and block changes as well as settled speech and images.
- End saves the draft first, then generates enhancement asynchronously. Users can
  read and edit while generation runs; generation cannot hold saving hostage.
- Reject or rebase a generated preview whose source/document revision changed.
- Preserve existing meetings through additive, defaulted schema migration.

Acceptance: type, capture an image, close/reopen the editor, end, and reopen the
meeting without losing a character or image. An interruption recovers the same
draft. Repeated End cannot create duplicate meetings or enhancement jobs.

Files: MeetingSession.swift, MeetingStore.swift, NotesBridge.swift, NotesWindow.swift,
AppDelegate.swift, native Codable models, packages/types/src/index.ts,
NotesWorkspace.tsx, NotesDocument.tsx, and the native host bridge client.

## Phase 2 — Capture moments and recover missed speech (September 16–18)

**Implemented in code:** additive capture origin and stable context anchors; a
20-second-before/15-second-after final-speech window that reconciles as speech
settles; original capture time independent of block order; non-activating native
thumbnail receipts; image/time navigation into an expandable moment viewer; image
diamonds synchronized with the Strip; caption editing; visibly provisional Catch Up
rows with stable per-source identities; and new-content tracking that responds to
provisional revisions without moving the reader. Provisional speech remains outside
the journal, final meeting and extraction. TypeScript, core, Swift and production
build checks pass. The three-capture real-device journey remains required before
this phase is considered release-proven.

Keep the existing region shortcut plus paste/drop. Capture success produces a
small thumbnail and time, with optional caption entry that does not steal focus.
Cancellation creates nothing. A screenshot requested before End must either finish
into that same draft or produce an explicit recoverable result.

- Extend image metadata with capture origin and stable context event references.
  Preserve original capture time separately from document position.
- Associate an initial context window around capture (start with 20 seconds before
  and 15 after); reconcile after final speech arrives. Allow expanding the passage.
  Nearby speech is context, not proof that every nearby sentence describes the image.
- In a saved document, click an image or its timestamp to open image + related
  passage. Keep one selected moment synchronized with the existing Strip.
- During capture, include the latest provisional turns in Catch Up. Reconcile them
  using stable source/range identities so settled text does not duplicate or jump.
  Keep provisional text visibly distinct and out of final extraction.
- Preserve scroll position, the new-content indicator, keyboard return to captions,
  and window placement. Timing remains approximate where the source requires it.

Acceptance: capture three images during distinct topics, including rapid consecutive
captures. Each opens the right surrounding passage; one capture without speech is
still saved. New Catch Up text appears as the recognizer reports it. Finalization
neither duplicates a turn nor displaces the reader. Manual image movement survives
enhancement, correction, restart and export.

Files: MeetingScreenshot.swift, MeetingSession.swift, CatchUpWindow.swift,
CatchUp.tsx, packages/core/src/notes/editor.ts, packages/ui/src/Strip.tsx,
NotesDocument.tsx, native/shared schemas.

## Phase 3 — Make the notes worth keeping (September 19–22)

Add a NotesProvider contract with the existing Apple implementation and one
optional cloud implementation. Before selecting a service, compare candidate
outputs on the same manually corrected transcripts to isolate summary quality.

Input: source-indexed transcript, user blocks, title/context, screenshot captions,
and optional separately labeled screenshot OCR. Include long-meeting chunk coverage
and a consolidation pass; do not silently discard later content.

Output: natural headings, paragraphs and bullets with source references. Keep
chronological sections around captured moments, with optional short highlights at
the top. User headings guide structure. User writing expresses importance but must
not be cited as something another participant said.

- Keep image insertion under application control, using timestamp/anchors. The
  model cannot invent, delete, or reposition screenshot blocks.
- Offer one “Enhance notes” action and a preview. Applying it replaces only agreed
  generated content; preserve user edits, deleted blocks and image positions.
- Support simple revision requests such as “shorter” or “more detail” after the
  base enhancement works. Do not build a general chat product.
- Provide retryable errors for unavailable models, timeouts, authentication and
  rate limits. Show an honest local fallback only when selected/appropriate; never
  silently send local-mode content to a provider.
- Route cloud calls through native code. Keep secrets out of the webview, exported
  notes, logs and repository. Store generation method/provider/model/revision with
  results, separately from the transcript's processing mode.
- If OCR fits the schedule, use local extraction and expose its text for correction.
  A visible due date can be cited as screen content; it does not become a spoken
  commitment. OCR failure must not prevent saving or note generation.

Acceptance: in each of three reference sessions, notes retain >=90% of a
human-written list of important points, contain no fabricated critical facts or
ownership, and have no duplicated sections or headings that say nothing. These
are release targets on this sample, not universal accuracy claims. Audit source
support manually; quote matching is only one mechanical check. Show saving promptly
and measure median/worst generation latency on target hardware.

Files: NotesSummarizer.swift, new native NotesProvider/cloud client/credential store,
NotesBridge.swift, settings UI, packages/types/src/index.ts, native models,
packages/core/src/notes/editor.ts and summary.ts, NotesDocument.tsx.

## Phase 4 — Review, corrections and a usable deliverable (September 23–24)

- Keep end review short and optional: decisions, your commitments, unresolved
  ownership. Confirm/correct/dismiss in place with nearby source access.
- A transcript correction increments source revision. Flag all dependent generated
  blocks and moments; preview an affected-section regeneration. Original wording
  and correction history persist. Reviewed or handwritten content remains protected.
- Display source excerpts and corrections consistently across notes, moments and
  review. A confirmed item whose source changes needs another review.
- Verify rich copy and HTML export with embedded images. Verify Markdown text copy;
  offer a Markdown-plus-assets export only if needed for reliable image portability.
  Do not claim data-URL images work in every destination.

Acceptance: a date correction updates an affected generated section through preview,
flags a previously confirmed commitment, preserves an edited paragraph, and keeps
the image in place. Export/reopen retains the visual context. A session with no
commitments does not manufacture a review checklist.

## Phase 5 — Prove the product and prepare submission (September 25–27)

Run three target users through their own review workflow. Ask them to create and
reuse the notes, then observe where they must reconstruct missing context. Record
time to a usable document, cleanup edits, source lookups, failures, and whether
they would use Excerpt instead of their current notes-plus-screenshots workflow.

Build an explicitly labeled public sample: a design review with a screenshot,
missed requirement, personal note, corrected name and confirmed commitment. Let
visitors operate the editor, moment viewer, correction and export. Use curated
sample data transparently; never imply it was transcribed live from their machine.

Record a separate real-device demonstration of start, subtitles, capture, Catch Up,
end, enhancement and source inspection. Keep it around 90 seconds. Validate a real
30–60 minute meeting separately from the short demo.

Verify fresh-install permissions and distribution on another supported Mac. Pursue
signed/notarized distribution if feasible; identify account/certificate requirements
early. If unavailable, publish accurate installation limitations and retain the
frictionless web sample. Installation quality is a product gate, not a footnote.

Check keyboard access, contrast, reduced motion, narrow-window layout and recovery.
Update README, CONTEXT, landing claims, source credits and submission description
to reflect what actually ships. Public repo and public demo must be accessible.

## Buffer and cut order (September 28–30)

Freeze feature work and use the final days for discovered failures and submission.
The dates are a planning budget, not an estimate proven by implementation. A missed
gate consumes optional scope before it consumes validation time.

Cut in this order: OCR; open-ended revision requests; screenshot annotations;
additional export formats; extra transcription engines beyond the winning path.
Do not cut draft recovery, image placement, source navigation, basic note quality,
or the real capture demonstration.

Defer: retained audio/retranscription, audio/video replay, automatic screenshots,
calendar OAuth, team accounts, CRM integrations, cross-meeting chat, automatic
speaker naming, mobile apps and multi-provider settings. Do not ship a play button
that implies audio exists when the Strip only navigates text.

## First implementation batch

Start with Phase 0 and the active-draft contracts from Phase 1. Deliver one real
session that saves writing, screenshots and transcript together before expanding
the notes provider. Complete changes as small reviewable commits; generated Mac
resources remain build outputs rather than files edited by hand.

Tests should focus on loss, reconciliation, stale writes, corrections and source
integrity. Existing build/parity tests continue to run. New layout-only changes need
visual/keyboard verification rather than implementation-mirroring unit tests.

## Reference basis

- [Build Games criteria and entry requirements](https://canivibecodeit.com/thebuildgames)
- [Granola notes and images](https://docs.granola.ai/help-center/taking-notes/taking-notes-in-granola)
- [Granola enhancement and source inspection](https://docs.granola.ai/help-center/taking-notes/ai-enhanced-notes)
- [Granola live transcript](https://docs.granola.ai/help-center/taking-notes/transcription)
- [Granola documented feature gaps](https://docs.granola.ai/help-center/feature-requests)

Sources reviewed during the September 11 strategy discussion. Competitor behavior
and submission rules should be rechecked before final public claims.
