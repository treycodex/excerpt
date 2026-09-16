# Excerpt — full context handoff

Everything another agent needs to continue this project: what it is, what was
decided and why, what is proven versus assumed, and the traps that already cost
hours. Read this before changing anything.

**Current audience, September 13:** The user shifted Excerpt toward agency-side
marketers: creative, media, performance, strategy, and account teams. The core job
is keeping creative assets and report views together with their discussion and
agreed next actions. Read [AGENCY-PRODUCT-INTENT.md](AGENCY-PRODUCT-INTENT.md).
This supersedes the earlier designer/product-builder audience. Report context
does not imply automatic report analysis or new integrations. The saved top-three
to-do plan has been updated; app positioning changes remain unimplemented.

**Product to-do, September 13 — the top three are implemented, not deployed.**
Immediate notes before optional setup, capability-accurate enhancement controls, and
agency campaign-review positioning. See
[PRODUCT-EXPERIENCE-TODO.md](PRODUCT-EXPERIENCE-TODO.md) for the plan, what was
verified, and what was not; and [AGENCY-PRODUCT-INTENT.md](AGENCY-PRODUCT-INTENT.md)
for the audience the positioning now serves. The other seven audit opportunities
remain out of scope. Three things to know before touching this work:

- **The demo no longer ends on a wizard.** Completion and "Skip to notes" both open
  `/m/:id` directly; `#/welcome/:id` and `#/setup` are rewritten in `router.parse`
  to the meeting and to Record. `Onboarding.tsx` still exists and is unreachable.
- **The notes toolbar is derived, not fixed.** `notesCapability` decides what may be
  offered from the environment and the host's `getNotesProviderStatus`; a bridge
  that cannot say which provider is ready gets the extractive rebuild and a link to
  settings, never three buttons nothing will serve. A failed rewrite keeps the
  current notes and offers the local rebuild as an explicit choice.
- **Both home-page stills are generated from the running app** by
  `apps/web/tools/render-product-shot.mjs`. They go stale the moment the notes view
  changes — re-run it rather than editing a picture.

Nothing here is deployed, and this entry is not approval to deploy it.

**Strategy update, September 11:** See [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md)
for the user-approved direction and proposed build sequence: visual meeting memory
for screen-based reviews, editable live drafts, synchronized screenshots and speech,
and optional BYOK note enhancement. That plan revisits the older blanket “no API
keys” restriction below while retaining a local path. It describes planned work,
not shipped behavior; the implementation and evidence recorded here remain the
baseline until the corresponding phases are completed.

---

## 1. What this is

**Excerpt** — a free, privacy-first meeting assistant. Cinematic captions during a
meeting; afterwards, structured notes where every item links to the verbatim
transcript passage it came from.

- Demo: **https://excerpt-rho.vercel.app** (public, required for submission)
- Repo: **https://github.com/treycodex/excerpt** (public, required)
- Built for **The Build Games**. Deadline **30 Sept 2026, midnight New York**.
  Work began 9 Sept 2026. Judged on Best Replacement / Most Polished / Most Creative.
- Replaces **Tactiq** and similar paid AI meeting-note tools.

### The thesis, which governs every decision
Tactiq's weakness is confident AI output you cannot verify. Excerpt's counter-claim
is deliberately narrower and defensible:

> Every note links to the passage it was extracted from, and you can correct
> anything we got wrong.

Consequences that are **not** negotiable without revisiting the whole product:
- **Extraction is deterministic grammar.** Items — decisions, actions, deadlines,
  questions — come from cue patterns and guards, never from a model. Titles are
  verbatim spans, never generated or rewritten. This is the load-bearing claim.
- **A false positive costs more than a miss.** Every ambiguity resolves toward
  silence. If Excerpt cannot tell, it says so rather than guessing.
- **Zero operating cost.** No API keys, no backend, no database, no accounts.

### One model, and exactly where it is allowed to be
This document used to say "no LLM anywhere". That has not been true since the Mac
app shipped `NotesSummarizer`, which runs **Apple's on-device Foundation Model**
through `FoundationModels` to write the prose notes document. It stays inside the
rules above only because of where it sits:

- It never produces **items**. Decisions, actions, deadlines and assignment are the
  deterministic engine's, on both surfaces, and a model cannot reach them.
- Every bullet it writes must carry an **exact quote that is a substring of its
  cited source**, or `supported()` drops it. A fabricated citation cannot be saved.
- It is **optional**. When Apple Intelligence is absent, times out, or produces
  nothing a quote supports, the extractive document from `buildNotesDocument` is
  saved instead and the user is told which of the two they are reading.
- It is **local and free**, so "zero operating cost" and "nothing leaves the Mac"
  both still hold.

The honest statement of the thesis is therefore *"nothing is asserted that is not
quoted, and nothing is quoted that was not said"* — not *"there is no model"*.
Anything that weakens the three bullets above is the change that matters, whatever
model is behind it.

---

## 2. Architecture

Web app only. No browser extension (cut deliberately — see §7).

```
getDisplayMedia({video, audio})  →  tab OR system audio  = EVERYONE ELSE
getUserMedia({audio})            →  microphone           = YOU
        ↓                                  ↓
  SpeechRecognition.start(track), processLocally: true   (×2, on-device SODA)
        ↓                                  ↓
        └──────────►  TranscriptEvent  ◄───┘
                            ↓
    captions (in-page + PiP) · transcript · extraction · evidence · notes
```

Two streams are the **whole** of what Excerpt knows about speakers: **you** vs
**not-you**. It cannot identify people, and must never imply otherwise.

### Platform facts (verified against MDN browser-compat-data)
| Capability | Chrome | Elsewhere |
|---|---|---|
| `SpeechRecognition.start(audioTrack)` | 135 | nothing |
| `SpeechRecognition.processLocally` | 139 | nothing |
| `available()` / `install()` | 139 | nothing |
| `getDisplayMedia({audio:true})` | yes | Firefox/Safari drop the audio track |
| Document Picture-in-Picture | 116+/130 | nothing |

Chrome-on-macOS only for live capture, by necessity. Tested on Chrome 152 and 153.

### Rules discovered the hard way — do not "simplify" these
- **Never call `available()`.** Chromium bug 444393111: it returned `"unavailable"`
  on a machine where `install()` then returned `true` and recognition worked.
  Always `install()` → `start()` → catch.
- **`SpeechRecognition` is `[Exposed=Window]`.** It cannot run in a Worker.
  Recognition lives on the main thread; Workers may do extraction only.
- **The Web Speech API exposes no timestamps at all.** `SpeechRecognitionResult`
  carries `transcript`, `confidence`, `isFinal` and nothing else. All timing is
  event-arrival time and lags real speech. The UI must keep saying "approximate".
- **Stop the previous adapter before starting another.** Orphaned recognizers keep
  their restart supervisor alive, hold the on-device engine, and starve every later
  capture silently. `stop()` calls `abort()` first — `stop()` alone finalises and
  can hold the session.
- **SODA finalises only on pauses.** Continuous speech produced 548 interims and 4
  finals in 104s. The adapter therefore commits a stable prefix every 6s (keeping a
  6-word volatile tail) as well as on pause. Without this a monologue yields an
  almost empty transcript, since extraction reads finals only.
- **`getDisplayMedia` requires the calling tab to be visible and focused**, else
  `InvalidStateError`.

---

## 3. Design DNA (Part 0 of the plan — treat as binding)

Five motifs. Any screen using none of them is off-brand.

1. **The Subtitle** — max 2 lines, ~42 chars, broken on *phrase* boundaries not
   width, white, no background box by default, fades only (180ms), film dash
   convention for two overlapping speakers. Accessibility overrides the aesthetic:
   a contrast toggle, `prefers-contrast`, `prefers-reduced-motion`.
2. **The Strip** — the meeting as a film strip. Items are marks; clicking a note
   scrubs the transcript to its passage. Nothing plays back — there is no audio.
3. **The Frame** — selection is four corner brackets. Never a border or fill.
4. **The Credits** — all chrome is mono, uppercase, letter-spaced; metadata as a
   film credits block.
5. **The Ground** — near-black, narrow grey ramp, and **one** accent (ember
   `#FF4D0F`) meaning exactly one thing: **settled**. Playhead, `DECIDED`, active
   frame. Nothing else.

Type: Instrument Serif (display/quotes) · Instrument Sans (captions/UI) · IBM Plex
Mono (labels). Self-hosted, 68K, no CDN request at runtime.

**Anti-patterns:** gradient cards, purple-blue AI shimmer, emoji in UI, chunky
rounded SaaS buttons, icon sidebars, skeleton shimmer, "✨ AI-powered", drop shadows
other than the subtitle's, cute diegetic naming. Design is cinematic; copy is plain.

---

## 4. Extraction engine — the part most likely to be broken by edits

Four categories only: **decision, action, deadline, question**. Ideas, quotes and
risks were cut for having no reliable linguistic signature.

**One sentence yields at most one item.** Order: action → decision → question →
standalone deadline. "Can you send the deck before Friday?" is an action with a due
date, not three items.

### Guards (each exists because a naive matcher gets that sentence wrong)
- negation, in both directions — a decision *not* to do something is still a
  decision ("we're not doing the podcast read"), but a negation that narrows a
  plan is not a decision against it ("we're not moving the whole campaign, *just*
  the hero spot" decides to move something, and filing it as a negative decision
  would report the opposite of what was said)
- conditional — "*if* legal signs off, we'll go with October" → proposed, not decided
- future-discussion — "we'll *discuss* October next week" is a decision to talk
- reported speech — "she *said* let's go with October"
- questions are never decisions
- bare confirmations ("That's decided.") attach as corroborating evidence to the
  preceding decision and never change its state — adjacency is not causation
- vague commitments — "I'll do my best" is not an action
- cue subjects — "movies are *locked in* by the aspect ratio" is not a decision;
  `locked in` / `agreed` / `signed off` require a subject doing the settling

### Assignment — the crown jewel, deliberately conservative
`assignee: 'you'` **only** for first-person commitment on your own microphone.
A remote "can you send that?" is `unassigned` and shown as **needs review**, because
two streams reveal who *spoke*, never who was *addressed*. Do not "improve" this
with inference.

### Text normalisation
Sentences carry a `norm` field with typographic punctuation folded to ASCII.
Match against `norm`; quote from `text`. Curly apostrophes once silently defeated
every cue pattern, zeroing decisions and assignments.

### Personalisation
Free-text instruction → boost terms, **shown as editable chips**, with each note
displaying which of the user's own words lifted it. Ordering only, never filtering —
a decision you forgot to prioritise is still a decision.

---

## 5. Repo map

```
apps/web/src/
  App.tsx            hash router, phases, preference application
  router.ts          #/ #/session #/record #/m/:id #/meetings #/preferences
  ambience.ts        procedural ambient bed (Web Audio, no asset)
  pip.ts             Document Picture-in-Picture caption window
  ErrorBoundary.tsx  never show a blank page
  demo/script.ts     21-line ~85s demo conversation
  views/             Landing, Session, CallFrame, Notes, Record, Library, Preferences
packages/core/src/
  capture/live.ts    LiveCaptureAdapter — the hard-won one; read §2 before editing
  capture/demo.ts    DemoTranscriptAdapter (seek, finalsUpTo)
  capture/devices.ts microphone listing, suspect-device flagging
  caption/lines.ts   subtitle line breaking
  extract/           sentences, decisions, actions, deadlines, questions, pipeline
  store/meetings.ts  IndexedDB meetings + recoverable finalised capture draft
  preferences.ts     boosts, salience
  export/markdown.ts
packages/ui/src/     Strip, Frame, tokens.css, strip.css
spike/               Day 0 feasibility harness + SPIKE-RESULTS.md (kept deliberately)
POLISH-PLAN.md        implemented polish review, acceptance checks, release proof

apps/mac/                       the macOS app (SwiftPM, one target)
  tools/sync-caption-tokens.mjs   reads packages/ui/src/tokens.css, writes the Swift
  Resources/excerpt-engine.js     GENERATED by @excerpt/core build:engine
  Resources/notes/                GENERATED by @excerpt/web build:notes
  Sources/Excerpt/
    App/            main.swift, AppDelegate — the menu bar, the app's only chrome
    Captions/       CaptionTokens.generated.swift (GENERATED), CaptionStyle,
                    CaptionOverlayView (Motif 1), OverlayWindow + OverlayController
    Capture/        CaptureEngine — one SCStream, two audio outputs
    Speech/         SourceTranscriber (settles speech), MeetingClock, ModelProvisioning
    Core/           Models (mirrors packages/types), CoreEngine (JavaScriptCore host)
    Storage/        MeetingStore — meetings JSON + append-only journal
    Meeting/        MeetingSession — the spine: capture → clock → journal → notes
    Notes/          NotesWindow (WKWebView), NotesBridge (7 methods), NotesScheme,
                    NotesSummarizer — the optional on-device model; see §1
    Gates/          the Stage 0 harness, now a window inside the app
  Tests/ExcerptTests/            106 tests: caption style, engine parity, store, clock,
                                  note verification, de-duplication, repeat splicing,
                                  plus the gated speech-fidelity harness (trap 17)
```

**Two generated inputs and one generated Swift file.** `Resources/excerpt-engine.js`
and `Resources/notes/` are build outputs of the web packages, not sources; `build.sh`
refuses to assemble a bundle without them. `CaptionTokens.generated.swift` comes from
the CSS. None of the three is ever edited by hand.

**The app runs the website's engine, it does not reimplement it.** `packages/core`
compiles `src/engine.ts` to a bundle that `CoreEngine` hosts in JavaScriptCore, and
`fixtures/parity.json` is run by vitest against the source and by `ExcerptTests`
against the bundle. The notes editor is likewise the web app's own build, in a
WKWebView, reading the Mac's meetings through `NotesBridge`.

**`isNativeHost()` decides what the interface says, never what it computes.** "Stored
in this browser" is true on the website and false in the Mac window; so is "timings
are approximate", because macOS reports an `audioTimeRange` and the browser reports
nothing.

**The caption presets are generated, not copied.** `tokens.css` is the one definition
of what Classic, Warm and Contrast mean; `build.sh` fails if the Swift is out of date.
Change a preset in the CSS and re-run the tool — never edit the Swift by hand.

One thing genuinely does not carry across: **Archivo**. Only a `.woff2` exists, which
CoreText cannot load, so the Mac caption is the system font. That is also what Apple's
own guidance asks for, and SF ships the optical sizing and tracking tables a subtitle
needs — but it does mean the two surfaces are not the same face, only the same metrics,
colour, shadow, wrapping rule and fade.

---

## 6. Status

**Web:** all nine planned phases plus the polish pass built. The polish pass is local
and has not been deployed.

**macOS: Stages 1 and 2 complete and running.** One meeting journey end to end —
capture, two transcribers, one clock, journal, assembly, extraction through the shared
engine, notes in a WKWebView — plus the guided setup, the menu bar, and the unsigned
distribution notes. 112 TypeScript tests, 113 Swift.

### Owed, in order — start here
0. **The hero footage still shows letter avatars.** The call tiles now draw a
   silhouette instead of an initial, but `apps/web/public/media/meeting.{mp4,webm}`
   and its poster were recorded before that, so the homepage video and the live demo
   disagree. One command fixes it, and it has to be run by a human because
   `screencapture -v` records a screen region and needs Excerpt frontmost — an agent
   driving the terminal keeps the focus and the tool refuses rather than photographing
   the wrong window:

   ```
   cd apps/mac && ./tools/record-media.sh hero   # then don't touch the machine ~45s
   ```
1. **`--diagnose` never finishes, and it is the tool everything else here is measured
   with.** The app launches with the flag, parses it (`ps` confirms the arguments
   reach the process), and then sits in the run loop forever: no `diagnose.txt`, no
   saved meeting, no log line, and only five threads — so nothing in `SpeechAnalyzer`
   ever spun up. The main thread is idle in `-[NSApplication run]`, so it is not a
   modal alert and not a deadlock on the main actor; `runDiagnosis` is awaiting
   something that never resumes, before the first log statement. `Permissions.state`
   is entirely synchronous, so the suspect is `transcriber.start()` — most likely
   `SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith:)` or the transcriber's
   model assets.

   **Not a regression.** Commit `0b4bf06` built in a clean worktree fails identically,
   so this predates the caption work and predates the two-run flag.

   It matters more than it looks: `--diagnose` is how owed item 3 below is meant to be
   discharged without a person, so until this is fixed **every unattended measurement
   on this app is blocked** and anything claiming to have been measured that way needs
   re-reading. Start by logging on entry to `runDiagnosis` and after each `await`.
2. **The caption is smoother and closer to the voice — by construction, not by
   measurement.** The 100ms poll is gone (the transcriber pushes), the edge now spans
   settled *and* unsettled speech so promotion moves nothing on screen, and lines are
   broken once by the shared engine instead of re-wrapped by width inside `body`. The
   logic is covered by 20 new tests and the app runs without crashing on the new path;
   the end-to-end latency number is not measured, because getting it needs `--diagnose`
   to work. Once it does, `--diagnose <seconds> <runs>` takes a run count, and two runs
   is also the standing check for trap 13:

   ```
   cd apps/mac && open build/Excerpt.app --args --diagnose 12 2
   say "Okay, let's move the launch to October. I'll take the revised deck and get it over by Thursday."
   # both meetings must have events — an empty second one is trap 13 again
   ```
3. **`assigned to you` from a real human voice.** Still the one unproven claim, on
   both surfaces. On the Mac: wear headphones (or the microphone hears the speakers
   and its copy is correctly suppressed as an echo, which is what happened in every
   test so far), then `open apps/mac/build/Excerpt.app`, Start listening, say
   *"I'll send the revised deck by Thursday"*, Stop. Expect one action **assigned to
   you** with a due date. `--diagnose 25` does the same run unattended and writes
   `~/Library/Application Support/Excerpt/diagnose.txt`.
4. **A real meeting longer than 30 seconds.** Recognition quality at length is no
   longer unmeasured — `SpeechFidelityTests` feeds 36-second clips in real time and
   scores the result against the script, which is what found trap 17 — but that is
   synthesised speech through a file, not two people over a call. The journal under
   load and the overlay during a real call are still unmeasured at length, and the
   new 15-second settle interval means a live transcript now trails speech by up to
   that much. Captions do not (they are pushed per result), and `stop()` promotes
   everything, but the catch-up panel reads the transcript and has not been watched
   with the slower settle in place.
5. **The overlay over an actual fullscreen meeting.** Judged only against this desktop.
6. Still untested from Stage 0: multiple displays, sleep/wake, gate 1's offline check.
7. **The setup flow has never been walked by a person**, only jumped through with
   `--setup-step` on a Mac where all three permissions were already granted. The
   denied path, the request prompts and the relaunch notice are unit-tested but
   unseen. `defaults delete com.excerpt.app setup.completed` makes it first-run again.

Recognition text is imperfect, but far less of that was the recogniser's doing than
was assumed for most of this project's life. `"get it over by."` losing its Thursday
in one run and keeping it in another is the signature of trap 17, not of a limit in
SODA: settling on a 4-second timer was discarding about a quarter of every word
spoken, and the fragments it left behind were then read as truncated sentences.
Extraction stays deliberately conservative about them — a truncated action is an
action with no due date, never an invented one — but the fragments themselves were
mostly avoidable and now largely are.

### Verified against real audio, not assumed
| | tab audio | system audio |
|---|---|---|
| captured | 2:00 | 1:34 |
| transcript rows | 21 | 18 |
| recognition | accurate | accurate |
| invented decisions | none | none |

Across ~4 minutes of speech containing no decisions, Excerpt extracted none.

### The one thing still unproven
**`assigned to you` has never fired from the user's own voice in a live capture.**
It works in the demo and in unit tests. The two-stream design exists for exactly
this claim. Test: with headphones, start a capture and say aloud —
*"Okay, let's move the launch to October. I'll take the revised deck and get it
over by Thursday. Can you send the client the numbers before Friday?"* —
expect one decision, one action **assigned to you**, and one request that must
stay **unassigned**.

Also untested by ear: the ambient bed. Measured only (peak −14 dBFS, RMS −23.6,
no clipping, RMS breathing 0.030↔0.074 on a ~60s cycle).

---

## 7. Deliberately not built — do not add without a reason

Auth · Supabase · cloud DB · billing · Zoom/Teams integrations · meeting bots ·
audio or video **recording** · CRM · Slack · Notion · calendar · team workspaces ·
SSO · mobile · analytics · sharing infrastructure · cross-meeting chat or memory ·
semantic search · template marketplace · ideas/quotes/risks extraction ·
**hosted LLM APIs** · **browser extension** · Chrome Web Store listing (fee).

"LLM APIs" used to be on that list without qualification, which read as "no model
at all" and was wrong — see §1. What is excluded is a **remote, paid, key-bearing**
one. Optional BYOK is an evaluated candidate, not a decision; it is out until a
measured comparison says otherwise, and it would have to keep the extractive path
as the default and the demo, and keep every bullet quote-verified.

The extension was cut because the consent ladder already covers the failure mode,
and pivoting to one mid-competition is an architecture change, not a fallback.

---

## 8. Traps that already cost hours

1. **Stale bundles.** A hash change does not reload JS. Three test cycles were spent
   on code that was never running. The nav shows a **build timestamp** — check it
   before trusting any test.
2. **Headless Chrome will not honour a narrow window on macOS.** It renders wide and
   crops, which reads as a broken mobile layout. Use **sized iframes** for
   responsive testing; that is the only way to get real media-query behaviour.
3. **`pnpm` errors (not warns) on blocked build scripts.** `pnpm-workspace.yaml`
   carries `allowBuilds: { esbuild: true }`. Without it every install exits 1,
   including on Vercel. `pnpm approve-builds --all --yes` writes the correct key —
   `onlyBuiltDependencies` is wrong for this version.
4. **A Mac's default microphone may be a Continuity (iPhone) or virtual device that
   records silence** while looking healthy. Excerpt flags these and defaults to a
   real one. This produced a 55-second capture with zero output.
5. **Without headphones the microphone hears the far side**, so both streams
   transcribe the same words and attribution is corrupted. `echoCancellation` does
   not help — it only cancels a WebRTC render stream. Text-level echo suppression
   drops mic finals with ≥60% token overlap against remote finals from the last 6s.
6. **Vercel preview URLs are auth-protected**; only the production URL is public.
7. **Deploys are CLI-driven**, not GitHub-connected. Pushing does not deploy;
   run `vercel deploy --prod --yes`.
8. **`@main` on an `NSApplicationDelegate` class silently does not wire the delegate.**
   The app launches with a menu bar and nothing else — no window, no status item, no
   callbacks, no error. `apps/mac/spike/Sources/ExcerptSpike/main.swift` is an explicit
   entry point for that reason, and it also keeps the delegate alive, since
   `NSApplication.delegate` is a weak reference.
9. **The recogniser settles on a clock, not on a sentence.** `finalize(through:)`
   cuts wherever the timer falls, so one sentence arrives as `"Let's move."` then
   `"the campaign launch to October."` — and extraction read the first fragment as a
   complete decision. `TranscriptAssembly` rejoins them; do not try to fix it by
   settling at detected pauses, which was tried and reverted (an RMS gate read
   ordinary speech as silence about half the time and the cuts landed inside words:
   `"Okay. . let's move the... , to."`).
10. **Without headphones the microphone hears the far side, and its copy is labelled
    YOU.** Measured on the first real capture: the loudspeakers saying *"I'll take the
    revised deck"* became an action assigned to the user — the one rule the product
    does not bend. Echoes are resolved over the finished transcript, never as results
    arrive: the two sources settle independently and interleave, so at arrival time
    the counterpart may not exist yet. On the Mac the test is overlapping audio ranges
    plus word similarity; the website has no timestamps, so it does not guess.
11. **A longer overlapping segment is a revision, not a repeat.** Dropping it as a
    duplicate lost `"by Thursday"` — and the deadline with it.
12. **`NSWindow.sharingType = .none` makes the overlay invisible to screen recording.**
   It looks like the right privacy default until the captions are missing from every
   demo video and every screenshot, with no error to explain it. The overlay is
   deliberately left capturable.
13. **A `SourceTranscriber` is good for one capture run, not one app launch.** `stop()`
    calls `emit.finish()`, and a finished `AsyncStream` never reopens; `start()` also
    resets none of `framesFed`, `settledThrough`, `pending` or the stats. Both
    `MeetingSession` and `GateSession` used to hold them in a `let` created once, so
    **the second meeting of any launch saved an empty transcript** — every settled
    segment yielded into a dead stream and vanished, while capture, recognition and the
    live caption all looked healthy. They are rebuilt per run now. Anything holding a
    transcriber across runs is this bug again.
14. **Two sources, two clocks.** Each `SourceTranscriber` counts seconds from its own
    first buffer, so the one that started later reports a *smaller* number for the same
    moment. Comparing `lastRangeEnd` raw hands the earlier stream a permanent lead —
    which is how the caption came to sit on YOU while the far side talked. `MeetingClock`
    exists for this; `CaptionEdge.owner` is the only place the comparison is made.

15. **A negative gap between two settled segments is an overlap, not a pause.** The
    recogniser re-reports the last few seconds it had already settled and recognises
    them again, differently. `coalesce` asked for `gap >= 0` before joining, so every
    one of those pairs stayed two rows and the overlap reached the transcript twice
    in two spellings — *Elsie Ramo* then *Elsie Reclamo*, *Paolo Martel* then *Paulo
    Martel* — and the notes carried both as separate points. Measured at a steady ~4
    seconds on **every** consecutive same-source pair of two real captures. Splice the
    repeat and keep the later reading; never drop the later segment, which is trap 11.
16. **Continuous narration never pauses, so it never ends a turn.** With no gap ever
    reaching `utteranceGap`, one 3½-minute capture coalesced into four rows, two of
    them 243 and 284 words. Break at a sentence end past a word budget — and only at a
    sentence end, or the fragment left behind is trap 9 again. Breaking on a real
    segment boundary keeps both timestamps audio-aligned; do not "improve" this by
    splitting text and interpolating times, which invents precision §10 forbids.

17. **Forcing `finalize(through:)` costs words, and the price is per cut.** The
    analyzer never settles by itself on continuous speech, so `SourceTranscriber`
    forces it on a timer — and the timer was set to 4 seconds, which threw away a
    **quarter of everything said**. Measured over two clips of clean synthesised
    narration, three trials each: ten cuts in 36 seconds gave 26.6% and 26.5% word
    error; two cuts gave 2.0% and 15.0%. Each forced cut truncates the analyzer's
    context and loses the words spanning it — *"and choose speaker view instead of
    gallery view"* became *", you, of Gallery View"*. Every `", ........,"` in a
    saved transcript is one of these. **It was never SODA's accuracy.** Cutting on a
    region boundary the analyzer itself reported is a second, smaller win that mostly
    removes the variance: 5/1/8 across trials became 2/2/2. `SpeechFidelityTests` is
    the harness; it runs in real time and is gated behind `EXCERPT_SPEECH_AUDIO`.

18. **The recogniser is not what is wrong with the transcript — we are.** Measured
    against LibriSpeech with human reference transcripts: Apple's `SpeechAnalyzer`
    scores **2.6%** word error on test-clean and **6.5%** on test-other utterance by
    utterance, which is parity with Parakeet TDT v3's published 2.5%. The same audio
    through our own streaming path scores **23–25%** and **18–21%**. About twenty
    points, and one word in seven, are destroyed between the recogniser and the saved
    transcript by `finalize(through:)` — see trap 17. Before anyone proposes replacing
    the model, replace nothing and read this: a swap buys about a tenth of a point and
    re-opens traps 9, 13, 14 and 17. `SpeechFidelityTests` is the harness, and its
    run-to-run spread is about seven points, so do not trust a single run.

---

## 9. Commands

```bash
pnpm install
pnpm dev                       # http://localhost:5273
pnpm --filter @excerpt/core exec vitest run
pnpm --filter @excerpt/core exec tsc --noEmit -p tsconfig.json
pnpm --filter @excerpt/web  exec tsc --noEmit -p tsconfig.json
vercel deploy --prod --yes     # from repo root

pnpm --filter @excerpt/core build:engine   # engine bundle for JavaScriptCore
pnpm --filter @excerpt/web  build:notes    # notes editor into the app bundle

cd apps/mac
node tools/sync-caption-tokens.mjs      # after changing a --cap-* token in the CSS
./build.sh                              # checks inputs, builds, signs the .app
swift test                              # 22 tests
open build/Excerpt.app                  # always `open` — a direct exec breaks TCC

# Launch flags, for driving it without a hand on the mouse:
#   --captions   show the overlay        --notes [id]  open the notes window
#   --gates      the Stage 0 harness     --overlay     overlay + a sample caption
```

`pnpm` lives at `~/.local/bin` — ensure it is on PATH.

---

## 10. What is still owed

[REMAINING.md](REMAINING.md) is the running list of what is known-broken or
known-missing, written 16 September 2026 after the engine and product-experience
reviews were closed. It records where each thing is and why it was left, so the
next person does not rediscover a decision as a bug. The two that matter most: the
demo still does not show the capture-and-discuss workflow the product exists for,
and per-source capture health — now shared by both surfaces through
`fixtures/source-health.json` — has never been watched during a real meeting.

## 11. If you change one thing, change it knowing this

The product's entire value is that it does **not** invent. Any edit that makes
extraction more eager, assignment more confident, or timing sound more precise than
it is, trades away the only thing that distinguishes Excerpt from every tool that
confidently hallucinates a decision nobody made.

This is not hypothetical, and the model is not the only way in. A `@Guide`
description in `NotesSummarizer` once carried the words *"such as Launch timing"* as
an example of a good heading. The local model copied it: a training video that never
mentioned a launch was filed under a topic called **Launch Timing**. One exemplar in
a prompt was enough to put a fabricated subject into a user's notes. Nothing named
in an instruction is inert — the model will treat it as subject matter. See
`NOTE-QUALITY-PLAN.md` for what that cost and what was done about it.
