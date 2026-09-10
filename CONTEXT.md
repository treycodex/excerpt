# Excerpt — full context handoff

Everything another agent needs to continue this project: what it is, what was
decided and why, what is proven versus assumed, and the traps that already cost
hours. Read this before changing anything.

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
- **No LLM anywhere.** Extraction is deterministic grammar. Titles are verbatim
  spans, never generated or rewritten.
- **A false positive costs more than a miss.** Every ambiguity resolves toward
  silence. If Excerpt cannot tell, it says so rather than guessing.
- **Zero operating cost.** No API keys, no backend, no database, no accounts.

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
- negation — "we're *not* moving the whole campaign"
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
    Notes/          NotesWindow (WKWebView), NotesBridge (7 methods), NotesScheme
    Gates/          the Stage 0 harness, now a window inside the app
  Tests/ExcerptTests/             22 tests: caption style, engine parity, store, clock
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

**All nine planned phases plus the polish pass built.** 68 tests, both typechecks and
the production build clean. The polish pass is local and has not been deployed.

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
semantic search · template marketplace · ideas/quotes/risks extraction · LLM APIs ·
**browser extension** · Chrome Web Store listing (registration fee).

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

## 10. If you change one thing, change it knowing this

The product's entire value is that it does **not** invent. Any edit that makes
extraction more eager, assignment more confident, or timing sound more precise than
it is, trades away the only thing that distinguishes Excerpt from every tool that
confidently hallucinates a decision nobody made.
