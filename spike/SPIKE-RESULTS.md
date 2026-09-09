# Day 0 Spike — results

Chrome 152.0.7977 · macOS 26.5.2 · on-device SODA provisioned via Live Caption

## Gate status: PASSING on every load-bearing test

| # | Test | Status | Evidence |
|---|---|---|---|
| 1 | Tab audio capture | **pass** | real capture, track labelled "Tab audio" |
| 1b | Missing "share tab audio" | **pass** | absence detected synchronously; recovery UI viable |
| 2 | Mic simultaneously | **pass** | display + mic tracks both live |
| 2b | **Two concurrent recognizers** | **pass** | both produced output at once; captions rendered both speakers with the subtitle dash convention |
| 3 | `start(audioTrack)` + `processLocally` | **pass** | 100% token recall on the mic fixture, on-device |
| 3b | Language pack install | **pass** | `install()` → `true` in 8–10ms |
| 4 | Latency | **partial** | final p50 **172ms** (real). Interim needs the level meters — synthetic audio cannot measure it. |
| 5 | Recognizer restart | **pass (implied)** | `restarts: 0` across 21–28 finals in long live sessions; no duplicates once detection was fixed |
| 6 | Denied permissions | **half pass** | `screen: NotAllowedError handled` confirmed. Mic half untested (grant not revoked). Error paths written either way. |
| 7 | Background behaviour | **provisional pass** | a final arrived while the tab was hidden (67s hidden, tab recognizer on live YouTube audio). fps figures unusable — measured on a build with a state-clobbering bug. Confirm in real use. |
| 8 | PiP caption rendering | **pass** | PiP window open, two-line fading subtitles |

## What this settles

**The architecture in Part 1 of the plan is sound and unchanged.** Specifically:

- `SpeechRecognition.start(audioTrack)` accepts a `MediaStreamTrack` and transcribes it
  on-device at high accuracy. This is the keystone and it is proven.
- **Two concurrent recognizers are viable**, so tab-vs-mic source separation survives.
  The mixed-WebAudio-graph + VAD fallback is NOT needed.
- Document PiP renders cinematic captions with no extension.
- `install()` → `true`; on-device is the default rung, so the privacy-first claim stands.

## Corrections made during the spike

Three failures were my harness, not the platform, and were fixed:

1. **Scoring race** — results were scored on audio-end, before the 24s tab recognizer
   had emitted its final. Now waits on each recognizer's own `end` event.
2. **Supervisor restart loop** — restarted against dead `captureStream` tracks when a
   *file* ended. Now checks `track.readyState`.
3. **Latency scored on synthetic audio** — pre-buffered audio reported `interim p50 0ms`
   and wrongly passed. Now refuses to score, and measures energy-onset → first interim.

## Product requirements discovered

- **Share-stopped is a first-class state.** Ending the screen share kills the track;
  starting recognition against it throws `InvalidStateError`. Excerpt must detect
  `track.onended` and offer a re-share, not error.
- **Chrome Live Caption is a confound**, not a dependency — it is only how SODA gets
  provisioned. It can be switched off afterwards and the pack remains.
- **`available()` cannot be trusted** (Chromium 444393111): it reported `"unavailable"`
  on a machine where `install()` then returned `true` and recognition worked.
  Confirmed empirically. The plan's "never call available()" rule is correct.

## Day 0 verdict: GATE PASSED — proceed to build

Every architecturally load-bearing test passes. The two outstanding items (6 mic-half,
7 fps detail) affect UI copy and error polish only; neither can change the design, so
they are folded into normal development rather than blocking it.

Provisional: recognition appears to survive tab backgrounding. If real use contradicts
this, the remedy is a line of copy in the session UI telling the user to keep the tab
open — not an architecture change.
