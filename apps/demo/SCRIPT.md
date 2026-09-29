# Excerpt demo — script and shot list

A ~2 minute film: real footage of Excerpt on this Mac, cut with brand motion. The
narration is not spoken; it runs as Excerpt-style subtitles (max two lines, ~42
characters, phrase breaks). Everything in the meeting is scripted and synthetic: no
real company, client or figures.

## How it was shot

- **Voices:** both parts are synthetic. `scripts/voice-meeting.sh` renders the
  lines below with Siri's natural voice (the host's lines pitched down) into
  `assets/meeting.wav`, played into a real Meet call while Excerpt transcribed it.
- **Screen recordings** (`scripts/rec.sh`): setup, the "Start a transcript?" and
  "End this meeting?" prompts, captions, Catch up and the capture.
- **After the call** (`scripts/shoot-stage.mjs`): Excerpt's own editor bundle, run
  on the stage (`stage/`) against the meeting recorded in that call, driven by
  script and filmed from Chrome's screencast.
- `pnpm --filter @excerpt/demo studio` previews the cut; `render` and `render:web`
  produce the film and the site's copy.

## The meeting (≈70 s, Google Meet in a Chrome guest window)

**YOU** — on this Mac, headphones on (your mic = "You" in the transcript).
**SAM** — the teammate, on another machine (arrives as meeting audio).

Each line is written for the extractor (packages/core/src/extract): one decision,
one action assigned to you with a due date, one unassigned action, one open question.
Say them naturally, but keep the key words.

| # | Who | Line | What it becomes |
|---|---|---|---|
| 1 | SAM | "Okay, quick one. I'm sharing the launch timeline now." | — (Sam shares the slide) |
| 2 | YOU | "Thanks. So the beta is ready, but the help center isn't." | context |
| 3 | SAM | "Right. If we ship on the seventh, the docs won't be finished." | context |
| 4 | YOU | "Then let's move the launch to October fourteenth." | **Decision** |
| 5 | SAM | "That works for design. The onboarding video needs a new end card." | **Action**, unassigned |
| 6 | YOU | *(press ⌘⇧S, drag over Sam's slide)* "I'll send the updated deck to the team by Friday." | **Action → you**, due Friday |
| 7 | SAM | "Do we still need the press embargo?" | **Question** |
| 8 | YOU | "I'm not sure yet. I'll check with legal on Monday." | question stays **open**; action → you, Monday |
| 9 | SAM | "Great. That's decided then, October fourteenth." | corroborates #4 |
| 10 | YOU | "Perfect. Thanks, Sam." *(leave the call)* | — |

Between lines 5 and 6, **YOU press ⌘⇧J** (Catch up) and let it sit ~3 s, then
close it: "you looked away; here is what you missed".

## Narration (subtitles over the cut)

| Scene | Subtitle |
|---|---|
| 0 Open | — (title: *The screen. The speech. The meeting, kept together.*) |
| 1 Problem | "Meetings move fast." / "And notes you can't check aren't really notes." |
| 2 Install | "Excerpt is free. No account. It runs on your Mac." |
| 3 Setup | "Setup takes a minute." / "Nothing you say leaves this Mac." |
| 4 Prompt | "When a call starts, Excerpt notices, and asks first." |
| 5 Captions | "Film-style captions for the whole call." / "Look away? Catch up on what you missed." |
| 6 Capture | "See something worth keeping?" / "Capture it. It lands next to the words." |
| 7 End | "Leave the call, and it asks before it stops." |
| 8 Correct | "Misheard a word? Fix it. The original stays." |
| 9 Notes | "Notes, only if you want them." / "Every line links to where it was said." |
| 10 Export | "Copy it, or save it with the screenshots." |
| 11 Close | "Excerpt. Free for Mac." |

## Shot list (`scripts/rec.sh start <shot>` … `scripts/rec.sh stop`)

| Shot | Who drives | What happens |
|---|---|---|
| `install` | me (Terminal, cut short in the edit) | paste the one-liner, the app opens to setup |
| `setup` | me | step through setup; subtitle preview; 15 s audio check (you say one line) |
| `join-and-prompt` | you join Meet · me click **Start transcript** (background) | the prompt appears ~2 s after joining |
| `meeting` | you + Sam (lines 1–10, ⌘⇧J, ⌘⇧S) | captions, Catch up, the capture receipt |
| `end-and-open` | me click **End meeting** (background) | the transcript opens with the slide inline |
| `correct` | me | correct one misheard word; the original is kept |
| `notes-and-source` | me | Notes → Write notes → click a **Source ↗** |
| `export` | me | Export → Save HTML with images… → cancel the panel |

## Before the shoot (checklist)

- [ ] `apps/mac/build.sh` with the latest fixes; Excerpt quit
- [ ] `scripts/stage.sh` (clean library, setup shows again)
- [ ] Do Not Disturb on · desktop icons hidden · Finder windows closed · Dock tidy
- [ ] Chrome guest window, Meet link ready · headphones on
- [ ] Sam has `assets/launch-timeline.png` open, ready to share that window
- [ ] Afterwards: `scripts/restore.sh`
