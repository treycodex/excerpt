# Excerpt

**Be in the meeting. We'll remember it.**

**Demo → https://excerpt-rho.vercel.app** — 85 seconds, nothing to install.

A free, privacy-first meeting assistant. Cinematic captions while you talk, and
structured notes afterwards where every item points back at the passage it came
from — so you can check it, and correct it.

Built for The Build Games as a replacement for paid AI meeting-note software.

---

## How it works

Excerpt listens to a tab (or to everything your Mac is playing) and to your
microphone, and transcribes both **on your machine** with Chrome's built-in
on-device speech engine. No API keys, no backend, no account, no recurring cost.

```
tab or system audio  = everyone else  ─┐
                                        ├─► TranscriptEvent ─► captions · transcript · notes
microphone           = you            ─┘
```

Two streams is also the whole of what Excerpt knows about who is speaking. It can
tell **you** from **not-you**, and nothing more — so an action you commit to
yourself is assigned to you, while "can you send that?" from the other side is
left unassigned rather than guessed at.

Notes are extracted deterministically — by grammar, not by a language model. Every
line in your notes is a verbatim span of something a person actually said. It also
means Excerpt is wrong sometimes, so every item can be edited, reassigned,
recategorised or dismissed.

---

## Record a real meeting

Chrome on macOS. Go to **Record**, then:

1. **Check the microphone** shown in the picker. A Mac will happily default to an
   iPhone's Continuity microphone or a virtual device installed by another app, and
   either one records silence while looking perfectly healthy. Excerpt flags the
   ones that usually capture nothing.
2. **Choose how it listens** — a browser tab (Meet, Zoom on the web) or anything
   playing on the Mac (the Zoom or Teams desktop app, FaceTime, a call on speaker).
3. In Chrome's picker, **tick "Also share tab audio"**. Without it Chrome shares the
   picture and no sound, and there is nothing to transcribe. Excerpt detects this
   and says so.
4. Talk. Press **End and write notes** when you're done.

If macOS has not granted Chrome screen recording, sharing fails with an unhelpful
browser error; Excerpt explains it and tells you Chrome must be fully quit and
reopened afterwards.

Verified on a real two-minute capture: on-device throughout, 21 transcript rows at
roughly one every six seconds, accurate recognition, and no invented decisions from
two minutes of unrelated speech.

---

## What Excerpt does not claim

- **It is not an audio record.** Excerpt stores a transcript, not a recording.
  Recognition makes mistakes and you cannot check a note against the original audio.
- **Timing is approximate.** The Web Speech API exposes no timestamps at all, so
  positions are measured when text arrives and lag real speech.
- **Extraction is fallible.** Rules miss things and occasionally misfire. Nothing is
  presented as certain, and everything is correctable.
- **It cannot tell who people are.** Only whether a voice was yours.
- **It does not read your other meetings.** Preferences persist; past meetings are
  never consulted.

---

## What's in it

- **Cinematic captions** — two lines maximum, broken on phrase boundaries rather
  than width, fading rather than sliding, with the film dash convention when two
  people overlap. Optional always-on-top window so they float over your meeting.
- **The Strip** — the meeting as a film strip. Items are marks on it; clicking a
  note scrubs the transcript to the moment it came from.
- **Four categories** — decisions, action items, deadlines, open questions. Chosen
  because they have crisp linguistic signatures. Ideas, quotes and risks were cut
  for having none.
- **Guards** — negation, conditionals, reported speech, future-discussion and
  questions are all rejected as decisions. "We'll discuss October next week" is a
  decision to talk, not a decision.
- **Preferences** — tell Excerpt what you care about; it shows you the exact terms
  it extracted and which of them lifted each note. Ordering only, never filtering.
- **Local library and Markdown export** — copy or download, plain enough to paste
  anywhere.

---

## Requirements

**Live capture:** macOS, Chrome 139+ (tested on 152 and 153). Chrome-only by
necessity — `SpeechRecognition.start(audioTrack)` (Chrome 135) and `processLocally`
(Chrome 139) exist nowhere else, and Firefox and Safari drop the audio track from
`getDisplayMedia` entirely.

**The demo** runs in any modern browser.

On-device speech needs Chrome's SODA language pack, which arrives with Live Caption
(`chrome://settings/captions`). If it is unavailable, Excerpt **stops and asks**
before using cloud transcription — it never switches silently, and the active mode
is on screen for the whole session.

---

## Development

```bash
pnpm install
pnpm dev          # http://localhost:5273
pnpm test
```

The nav bar carries the build timestamp. If it looks stale, the page is running
cached JavaScript — a hash change does not reload the bundle.

`pnpm` blocks dependency build scripts by default and *errors* rather than warns,
so `pnpm-workspace.yaml` carries an `allowBuilds` entry for esbuild. Without it
every install exits 1, including on CI.

```
apps/web        product + competition demo
packages/core   capture adapters, extraction, preferences, export
packages/ui     Strip, Frame, design tokens
packages/types  shared schemas
spike/          Day 0 feasibility harness (see spike/SPIKE-RESULTS.md)
```

`spike/` is kept deliberately. It is the throwaway harness that proved the
architecture before anything was built on it, and it records what was measured
rather than assumed — including the three failures that turned out to be bugs in
the harness itself.
