# Note quality — what went wrong, what changed, what is still owed

Raised 11 Sept 2026 against two captures of a training video
(`https://youtu.be/QMYQD8cjdJE`). The notes were thin, partly wrong, and in one
case absent. This is the diagnosis, the Phase 1 work that is now done, and the
honest limit of what it fixed.

Supersedes `NOTE-QUALITY-FOLLOWUP.md`.

---

## 1. The two captures

Both are still on this Mac under `~/Library/Application Support/Excerpt/meetings`.

| | capture A · 10:22 | capture B · 10:26 |
|---|---|---|
| length | 2:20 | 3:32 |
| transcript | 12 events, 350 words | **4 events**, 582 words |
| items extracted | 3 | 1 |
| notes | 3 key points, 4 topics, **3 distinct bullets** | **none at all** |

---

## 2. What was actually wrong

Five separate defects. Only the last is about the video being a lecture.

### 2.1 A fabricated topic heading
Capture A was filed under a topic called **Launch Timing**. The recording is about
side income and college archetypes and never mentions a launch.

The cause was one word in a prompt. `NotesSummarizer` described the topic title
field as *"A short specific subject heading, such as Launch timing"*, and the
instruction block named a launch and an onboarding permissions step twice more as
examples of correct grouping. Apple's on-device model is small enough to treat an
exemplar as subject matter, and it did.

This is the failure mode §10 of `CONTEXT.md` exists to prevent, arriving through a
door nobody was watching. The model never invented a *fact* — every bullet under
that heading still carried a real quote — but the heading itself was invented, and
a heading is an assertion about what a meeting was about.

### 2.2 Every point printed two or three times
Three distinct bullets filled nine slots: each appeared as a key point and again
under one or two topics. Nothing de-duplicated across sections or across passages.
The website's `buildNotesDocument` has had a `seen` set since it was written; the
model path never got one.

### 2.3 Bullets that named the subject instead of reporting it
Every surviving bullet began with "Discuss": *"Discuss college archetypes."*
*"Discuss the party animal archetype."* That is a table of contents. The
instructions asked for facts and said nothing against writing the topic instead,
and `supported()` had no reason to reject them — they were correctly quoted and
correctly cited. They were simply empty.

### 2.4 A meeting saved with no notes, silently
Capture B has no notes document at all. `MeetingSession.finish()` read:

```swift
if let notes = try? await NotesSummarizer.summarize(meeting) { … }
```

The `try?` discarded `unavailable`, `noSupportedNotes` and `timedOut` alike, and
nothing stood behind it: `buildNotesDocument` was never exported through
`excerpt-engine.js`, so the Mac app had no extractive fallback to fall back to,
despite the README saying it did. The user was shown "Organizing key points…" and
then given nothing, with no error and no reason.

### 2.5 The transcript underneath is poor, and the content is not a meeting
Capture B is 582 words in **four** events, two of them 243 and 284 words unbroken,
carrying strings like `, ........,` and `"I'm cooking spotlight forever"` (clicking).
`supported()` needs an exact substring match against that text, which is part of why
so little survived.

And a training video is a monologue. The engine extracts decisions, actions,
deadlines and questions, and a lecture contains almost none. The one "decision" it
did find in capture A — `proposed: "I guess it's a general question is that"` — is a
false positive off a fragment.

---

## 3. Phase 1 — done

Scope chosen deliberately: stop fabricating, stop failing silently. No new
architecture, 19 days to the deadline.

| Change | Where |
|---|---|
| Removed every exemplar noun from the guides and instructions | `NotesSummarizer.swift` |
| Added an explicit rule against bullets that only name a subject | `NotesSummarizer.swift` |
| `isMeta()` rejects such bullets in `supported()`, whatever the model does | `NotesSummarizer.swift` |
| De-duplication across key points, topics and passages; same-titled topics merge | `NotesSummarizer.assemble()` |
| Verification and assembly split out as a pure function, testable without Apple Intelligence | `NotesSummarizer.assemble()` |
| `notes(meetingJSON)` added to the engine contract; `ENGINE_VERSION` → `2` | `engine.ts`, `CoreEngine.swift` |
| `try?` replaced with real handling: the reason is logged and kept, the extractive document is saved instead, the status line says which notes these are | `MeetingSession.swift` |
| Recovered meetings get an extractive document too, instead of none | `MeetingSession.recover()` |

**One bullet, one place** is a deliberate change of shape: a point appears as a key
point *or* under a topic, never both. `editableDocument()` already handled a key
point that no topic carries, so the editor needed nothing.

`isMeta` is blunt on purpose — it rejects the lead-in whole, even when a real clause
follows, so *"We discussed moving the date because approval is pending"* is dropped
too. A dropped bullet is a miss; a bullet that says only that a subject came up is
noise wearing the costume of a note, and the deterministic engine still extracts the
decision underneath it.

### Verified

- 107 TypeScript tests, 95 Swift tests, both suites green. Six new Swift cases and
  one new TypeScript file cover the meta rule, de-duplication, topic merging, the
  empty-document case, the absence of leakable nouns in the prompt, and the engine's
  new `notes` call reaching Swift through JavaScriptCore.
- `tsc --noEmit` clean on `@excerpt/core` and `@excerpt/web`.
- Engine bundle rebuilt; `CoreEngine` version gate raised to `2`, so a stale bundle
  now fails at launch rather than at the first meeting.
- **The real transcript, re-run through the real model on this Mac.** Capture A now
  produces topics *Extra Income*, *College Experiences*, *Questions* and *Advice*.
  **"Launch Timing" is gone.** Four of the drafted bullets are caught by `isMeta`;
  the rest fail the citation check; the document comes back empty, which is now
  reported as `noSupportedNotes` and answered with the extractive fallback rather
  than with silence.

### Not verified

- No live end-to-end meeting has been run since the change. The fallback path was
  exercised through the engine and through unit tests, not by stopping a real
  capture on a Mac with Apple Intelligence turned off.
- `notesNotice` is surfaced only as a short clause on the menu-bar status line. It
  is not yet shown in the notes window, where a reader is more likely to want it.

---

## 4. Phase 2 — done

### 4.1 Re-reported seconds were reaching the transcript twice

The finding that explains most of §2.5. **Every** consecutive same-source pair in
both captures overlaps in time by about four seconds:

```
e43 74.8–90.0   e55 85.9–98.2   e62 94.3–102.3   e66 104.7–110.1   e67 106.3–117.4
        └ −4.1s ┘       └ −3.9s ┘        └ … ┘            └ −3.8s ┘
```

The recogniser hands back the tail it had already settled and recognises it again,
differently. `coalesce` required `gap >= 0` to join two segments, so a negative gap —
which is not an impossible pause but an *overlap* — fell through to "these are two
separate utterances", and the overlapping seconds were printed twice in two
recognitions of themselves: *Elsie Ramo* then *Elsie Reclamo*, *Paolo Martel* then
*Paulo Martel*. That is where the near-duplicate notes in §4 of the first draft of
this document came from.

Segments that overlap are now joined, and `spliceRepeat` cuts the repeated words out
of the head so the later reading — made with more audio behind it — is the one kept.
Nothing after the repeat is lost, which is trap 11 and cost a deadline once.

Two things had to be got right, and both were got wrong first:

- **Take the best-matching window, not the longest that clears the bar.** A ten-word
  window scraped past the threshold by reaching beyond the repeat to a word that
  happened to recur; the eight-word window that *is* the repeat scored higher. The
  first version cut "you go" out of *"There you go."*
- **The two sides of a repeat are not the same length.** Eleven words came back as
  twelve — an inserted "uh", an added "hi". Scoring is now the longest common
  subsequence over windows of independent lengths, counting *adviser*/*advisor* and
  *Paolo*/*Paulo* as the same word, since the second hearing is a different
  recognition of one sound.

### 4.2 Turns that ran for minutes

Continuous narration never pauses for `utteranceGap`, so capture B coalesced into
four rows, two of them 243 and 284 words. A turn is now ended at the first sentence
end past 80 words — and **only** at a sentence end, so nothing is cut mid-sentence
into the fragment that trap 9 turns into a false decision. Because the break falls on
a real segment boundary, both timestamps stay audio-aligned: nothing is interpolated,
and no timing is made to sound more precise than it is.

> The break cannot be demonstrated by replaying these two saved meetings: their
> events are already assembly's output, not the raw segments it runs on, and the
> journal was discarded at save. It is covered by unit tests over simulated raw
> segments instead. What replaying them *does* show is §4.1, because the overlap bug
> was present when they were first assembled too.

---

## 5. Phase 4 — done

`shapeNotice` in the shared engine: one voice throughout a recording of any length,
and the notes say so.

> Only one voice was recorded. Excerpt looks for the decisions, actions, deadlines
> and questions people settle between them, so a talk or a recording leaves it
> little to find.

It lives in `packages/core` and is reached by the Mac through the engine bundle, so
the website and the app cannot tell a user two different things about one meeting.
It says *one voice*, never *one person* — two streams reveal who spoke, never how
many people are in a room.

---

## 6. The notice, where notes are actually read

`NotesDocument.notice` is a new optional field carrying why a set of notes looks the
way it does — the shape of the recording, and where relevant why these are the
transcript-based notes rather than the summarised ones. It is saved with the meeting,
so it survives a reload and is still there tomorrow, and it renders under the notes
toolbar rather than only on a menu-bar line that is gone a second after the meeting
ends. A regeneration's own message takes precedence while it is showing.

Rendering it surfaced a second, smaller dishonesty a line above: the notes page
subtitle read *"Your conversation, with the important parts ready to revisit"* on a
recording the page had just said held a single voice. It now reads *"What was
recorded…"* whenever a notice is present, and is unchanged otherwise.

---

## 7. Also done: choosing excerpts without a fixed vocabulary

`substance()` scored sentences against `launch|budget|pricing|customer|revenue…`,
which is a good signal for the meetings it was written for and no signal at all for
anything else. It now also counts the terms *this* meeting keeps returning to —
words of four letters or more, minus a common-word list, appearing at least twice.
Still counting, not guessing, and no vocabulary lock-in. This mattered more the
moment the extractive path became reachable on the Mac.

---

## 8. Where the two reported captures stand now

Run end to end through assembly, extraction, the real on-device model and the
fallback:

| | capture A | capture B |
|---|---|---|
| events | 12 → **8** | 4 → **3** |
| duplicate words removed | 29 | 11 |
| on-device summary | nothing survives verification | nothing survives verification |
| notes | extractive, 5 points | extractive, **5 points — was none at all** |
| notice | shown | shown |

Capture B, which had **no notes document whatsoever**, now reads:

```
It's only going to record me, and not the little strip of videos.
No one else is the same size window as you and click on view on the top.
I'm going to mute her back, and I'm going to remove her from the spotlight
so that I'm still the only one on the screen.
```

That is a fair account of a Zoom-recording tutorial, chosen by recurring-term
scoring that the old fixed vocabulary could not have found.

Capture A is better but still weak, and honestly so: the transcript is badly
degraded (`, ........,`, *"I'm cooking spotlight forever"*), and the content is a
monologue. The notice now says that rather than leaving the reader to conclude the
tool is broken.

**The model still produces nothing usable on either.** Every bullet it drafts is
either a contentless subject label or uncited, and all of them are rejected. That is
the designed answer — silence over invention — and it is why the fallback now has to
be good.

### Verified

- **112 TypeScript tests, 105 Swift tests**, both suites green. New coverage: the
  meta rule, de-duplication, topic merging, the empty-document case, prompt-leak
  absence, the engine's `notes` and `shapeNotice` calls through JavaScriptCore,
  overlap splicing, unequal-length repeats, near-identical words, sentence-end
  breaking, the refusal to break mid-sentence, and recurring-term selection.
- `tsc --noEmit` clean on `@excerpt/core` and `@excerpt/web`; engine bundle rebuilt.
- Both real captures replayed end to end, including through the live on-device model.

### Not verified

- No live end-to-end meeting since the change. Phase 2's turn-breaking in particular
  is covered by simulated raw segments, not by a real capture — see the note in §4.2.
- The notice was **seen on screen** in the notes window, in the running web app, on a
  seeded monologue-shaped meeting that made `shapeNotice` decide for itself rather
  than having the field set by hand — and absent on a two-voice meeting. The Mac's
  `WKWebView` runs this same build, but was not itself opened.

---

## 9. Still owed

**Phase 3 — BYOK.** Not started, and it needs a decision this work cannot make. The
measured comparison the plan gates it on requires an API key, which I will not handle
or enter; the user would supply it in the app themselves. Framed correctly, it is a
provider swap behind the same `supported()` gate, not a break with the thesis —
conditions unchanged: off by default, extractive stays the demo path and the
fallback, every bullet keeps an exact quote that must substring-match its cited
source, items stay deterministic, edits and screenshot timing untouched.

**Transcript quality at the source — found, measured and fixed. See §10.**

**Two contentless bullets not caught by `isMeta`.** *"Read a few questions."* and
*"Ask the audience a question."* were rejected only by the citation check. Adding
`read`/`ask` to the lead-in list was considered and rejected: *"Ask legal to sign
off"* is a real action, and losing it costs more than letting the citation check do
its job.

---

## 10. Transcript quality at the source

It was not SODA. It was a four-second timer.

### What was wrong

`SpeechAnalyzer` never settles by itself on continuous speech — measured earlier in
this project as "a 20-second volatile window that never advanced" — so
`SourceTranscriber` forces it with `finalize(through:)` every four seconds. Every
forced cut truncates the analyzer's context, and the words spanning the cut are lost.
Ten cuts in 36 seconds threw away roughly **a quarter of everything said**.

That is the whole provenance of the debris in the reported captures. `", ........,"`,
`", you,"`, *"I'm cooking spotlight forever"* — none of it is a recogniser struggling
with a hard recording. It is text being cut in half mid-word and the halves being
committed separately.

### How it was measured

A new gated harness, `SpeechFidelityTests`, feeds an audio file into a real
`SourceTranscriber` **in real time** — 100ms buffers, the size ScreenCaptureKit
delivers — and scores the settled transcript against the script that was spoken, by
word-level Levenshtein. Feeding the file as fast as it reads would hand the analyzer
the whole clip before the first settle, which is the one thing that never happens in
a meeting.

The clips are `say`-generated continuous narration with no pause in them: clean
audio, no noise, no accent, no crosstalk, so anything lost is lost by the pipeline
and not by the microphone. Two clips, two voices, three trials per setting, because
single runs vary by ±6 points and the first three conclusions drawn from them were
all wrong.

```
say -v Samantha -r 175 -o clip.aiff -f script.txt
EXCERPT_SPEECH_SWEEP=3 EXCERPT_SPEECH_AUDIO=clip.aiff \
  EXCERPT_SPEECH_EXPECTED=script.txt swift test --filter SpeechFidelity
```

### What it found

Word error rate against the spoken script, mean of three trials:

| settling | clip 1 | clip 2 | words kept | cuts |
|---|---|---|---|---|
| any instant, every 4s — **what shipped** | 26.6% | 26.5% | 101/134 · 106/127 | 10 |
| region end, every 4s | 25.9% | — | 99/134 | 9 |
| any instant, every 15s | 5.0% | — | 128/134 | 2 |
| **region end, every 15s — now shipping** | **2.0%** | **15.0%** | 132/134 · 112/127 | 2 |

Two separate effects, and they were confounded for most of this investigation:

- **How often dominates.** Ten cuts cost a quarter of the words; two cost a fraction
  of that. This is nearly all of the win.
- **Where it lands removes the variance.** Cutting on a boundary the analyzer itself
  reported took clip 1 from 5.0% to 2.0% and, more to the point, from 5/1/8 across
  trials to 2/2/2. Placement stops being luck.

The gap between the two clips at the new setting — 2.0% against 15.0% — is the honest
one: clip 2 is a male voice reading technical vocabulary, and its residual error is
ordinary recognition error rather than cut damage. Both improved, by different
amounts. The claim is "much better", not "solved".

This is **not** the RMS silence gate that was tried and reverted (trap 9). That
guessed at pauses from audio energy and was wrong about half the time. This uses the
analyzer's own reported region boundaries and guesses at nothing.

### What it costs

A settled transcript now trails live speech by up to 15 seconds. Captions do not pay
it — they are driven by `live`, pushed the instant a result lands — and `stop()`
promotes everything, so no meeting ends short. **The catch-up panel does pay it**: it
reads the transcript, so its 30-second lookback now has a hole at the live edge that
it did not have before. That is a real regression in one feature, taken knowingly
against a quarter of every word in every meeting, and it has not been watched on
screen.

### What is still not known

- No real meeting has been run through this. Everything here is synthesised speech
  fed from a file.
- Whether 15 seconds is the right number beyond these clips. The relationship is
  monotonic over 4 / 6 / 10 / 15 (26.6 / 19.9 / 10.4 / 2.0 on clip 1), so longer is
  better and the limit is the latency the catch-up panel can stand — not accuracy.
- The two settling knobs are `nonisolated(unsafe) static var` so the harness can
  sweep them. Nothing in the app writes to them, and the sweep restores the defaults,
  but they are mutable global state in an actor's type and that is a seam worth
  knowing about.
