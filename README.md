# Excerpt

**Be in the meeting. We'll remember it.**

**Demo → https://excerpt-rho.vercel.app** — 85 seconds, no install.

A free, privacy-first meeting assistant. Cinematic captions while you talk, and
structured notes afterwards where every item links back to the passage it came from.

Built for The Build Games as a replacement for paid AI meeting-note software.

## How it works

Excerpt shares your meeting tab's audio and your microphone, and transcribes both
**on your machine** using Chrome's built-in on-device speech engine. No API keys, no
backend, no account, no recurring cost. Nothing leaves your device unless you
explicitly choose otherwise.

```
tab audio  = everyone else  ─┐
                              ├─► TranscriptEvent ─► captions · transcript · notes
microphone = you           ─┘
```

Notes are extracted deterministically — by grammar, not by a language model. That
means every line in your notes is a span of something a person actually said, and
Excerpt can show you where. It also means Excerpt is wrong sometimes, so everything
is correctable.

## What Excerpt does not claim

- **It is not an audio record.** Excerpt stores a transcript, not a recording.
  Speech recognition makes mistakes and you cannot check a note against the audio.
- **Timing is approximate.** The Web Speech API exposes no timestamps at all, so
  positions are measured at event arrival and lag real speech.
- **Extraction is fallible.** Rules miss things and occasionally misfire. Every item
  can be dismissed or corrected.
- **It does not read your other meetings.** Preferences persist; past meetings are
  not consulted.

## Requirements

macOS and Chrome 139+ for live capture. The demo runs in any browser.

On-device speech needs Chrome's SODA language pack. If it is missing, Excerpt asks
before falling back to cloud transcription — it never switches silently.

## Development

```bash
pnpm install
pnpm dev          # http://localhost:5273
pnpm test
```

`pnpm` blocks dependency build scripts by default and *errors* rather than warns,
so `pnpm-workspace.yaml` carries an `allowBuilds` entry for esbuild. Without it
every install exits 1, including on CI.

```
apps/web        product + competition demo
packages/core   capture adapters, extraction, preferences, export
packages/ui     shared components and design tokens
packages/types  shared schemas
spike/          Day 0 feasibility harness (see spike/SPIKE-RESULTS.md)
```

`spike/` is kept deliberately. It is the throwaway harness that proved the
architecture before any of it was built, and it records what was measured rather
than assumed.
