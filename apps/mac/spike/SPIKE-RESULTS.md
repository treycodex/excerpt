# Excerpt for macOS — Stage 0 gate

Xcode 26.6 · Swift 6.3.3 · macOS 26.5.2 · MacBook Air (Apple silicon)
Measured against real audio, not assumed.

## Status

| # | Gate | Result | Evidence |
|---|---|---|---|
| 1 | Speech model provisioning | **pass** | en-US supported, installed, reserved; `AssetInventory.status` = installed |
| 2 | System audio capture | **pass** | 84.5s of sound, 48000Hz ×1, 4754 buffers |
| 3 | Microphone capture | **pass** | separable from system audio, own transcript |
| 4 | Three authorizations | **pass** | microphone, screen recording, speech — each independent |
| 5 | Two transcribers | **pass** | system 313 volatile / 31 finalized · mic 148 / 23, concurrent, on-device |
| 6 | Volatile → finalized | **pass** | 313 volatile superseded by 31 finalized across 23 settle calls |
| 7 | Continuous speech 3min+ | outstanding | longest run so far ~95s |
| 8 | Shared timeline | **pass** | system 92.0–95.1s · mic 93.1–94.9s · monotonic |
| 9 | Overlay over fullscreen | **pass** | transparent, no panel, readable over fullscreen — **requires accessory mode** |
| 10 | Click-through | **pass** | `ignoresMouseEvents`; clicks reach the app underneath |
| 11 | Multi-monitor + Spaces | not started | |
| 12 | Interrupt / sleep–wake | partial | tail promotion on stop implemented; interruption untested |
| 13 | Stop is reliable | **pass** | stream and microphone released every run |
| 14 | Unsigned rebuild | **answered** | ad-hoc: grants lost. Self-signed: grants survive. See below. |

Sample output, both sources, one session:

```
system FINAL 15.28–20.74  "details make iPhone dual feel exceptionally solid."
system FINAL 20.74–24.90  "But also a ceramic shield on the back."
mic    FINAL  5.89–8.22   "So I'll play 2 videos."
mic    FINAL 29.61–33.68  "I determined between the two."
```

## Findings that change the plan

**1. `installedLocales` and `AssetInventory.status` disagree.**
On a first run `installedLocales` reported `true` while `status` reported `supported`
— the model was not actually present. A setup flow trusting `installedLocales` would
declare itself ready and fail at the first meeting. Trust `status`.

**2. `AssetInventory.reserve()` returns `false` when the locale is ALREADY reserved.**
Not a failure. Checking the return value reports a healthy install as broken; check
`reservedLocales` instead.

**3. `SCShareableContent` is not a permission request.**
Using it as one reports `denied` forever and never shows the user a prompt.
`CGPreflightScreenCaptureAccess()` checks, `CGRequestScreenCaptureAccess()` prompts.
Screen recording then only takes effect after the app is **relaunched**.

**4. Launching outside LaunchServices breaks TCC attribution.**
Running the binary directly from a shell attributes permission requests to the
terminal, not the app. Always `open` the bundle.

**5. Ad-hoc signing loses every permission on rebuild — a locally self-signed
identity keeps them.** Measured both ways: with `codesign -s -`, microphone and
speech fell back to `undetermined` and screen recording to `denied` after a single
rebuild. With a self-signed identity, all three survived. `tools/dev-identity.sh`
creates one; it is not an Apple certificate and does nothing for Gatekeeper. Two
traps: OpenSSL 3 writes a PKCS#12 MAC macOS rejects (use `-legacy`), and the
certificate must be trusted for `codeSign` or `find-identity` reports none.

**6. Analyzer timestamps must be counted in frames fed, not capture PTS.**
Passing `sampleBuffer.presentationTimeStamp` after sample-rate conversion produces
`SFSpeechErrorDomain Code=2 "Audio input timestamp overlaps or precedes prior audio
input"` and nothing transcribes. Count frames in the analyzer's own format.

**7. The analyzer holds a growing volatile region indefinitely on continuous speech.**
Measured: a 20-second window on the microphone that never advanced. `finalize(through:)`
must be called periodically — here every 4s, leaving a 2s volatile tail for the live
overlay. This is *not* the web build's chunking workaround: there we guessed that
text had stopped changing; here the framework settles authoritatively and reports it.

**8. A region's final text arrives BEFORE the volatile-window update that settles it.**
Measured: `res 0.00–1.14 | vol 0.00–2.24` was the final text for 0–1.14, proven only
when the window moved to 1.14–2.24 immediately afterwards. Finality therefore cannot
be judged when a result arrives. Results are held pending and promoted when the
window advances past them; whatever remains pending at Stop is promoted rather than
dropped.

**9. The overlay only appears over fullscreen apps when the app is an ACCESSORY app.**
Measured both ways. As a regular app the overlay renders correctly over windowed
content and vanishes the moment another app goes fullscreen — which is precisely when
a meeting needs it. `.fullScreenAuxiliary` does not help, because it is meant for the
fullscreen app's own auxiliary windows. An accessory (menu-bar) app owns no Space, so
its `canJoinAllSpaces` window floats above everything.

Window level also matters: `maximum` rather than `screenSaver`.

This is the product's intended architecture rather than a workaround — Excerpt is a
menu-bar app — but it means the overlay and the Dock icon are mutually exclusive.

## Known rough edges (Stage 1 work, not gate blockers)

- Overlapping promotions produce near-duplicate segments
  (`4.02–8.38 "For his 1st act"` then `7.02–8.38 "For his 1st act."`). Needs dedup
  keyed on range overlap rather than start alone.
- Some finalized segments are punctuation only (`"."`, `".."`). Needs a minimum
  content filter before they reach a transcript.

## Still owed before the gate is fully passed

Gate 7 (3+ minutes continuous), gates 9–11 (the overlay), gate 12 (interruption and
sleep/wake), and the offline check for gate 1.
