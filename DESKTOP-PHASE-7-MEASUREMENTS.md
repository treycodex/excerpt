# Phase 7 storage, bridge, and live fixture checks — second pass

September 23, 2026. Synthetic data only, in isolated temporary `MeetingStore`
roots. No production meeting, image, permission, Keychain item, or signing setting
was read or changed.

## Fixture and method

- MacBook Air (Apple M2, 8 cores, 16 GB), macOS 27.0; debug Swift test process.
- One 90-minute meeting: 540 final transcript events, 90 note bullets, and 30
  valid 2560×1440 PNG screenshots, plus 99 five-minute text meetings. The main
  fixture repeats one 736,737-byte deterministic PNG, preserving the first-pass
  comparison. A separate run makes 30 distinct valid PNGs to measure asset writes.
- `EXCERPT_PHASE7_MEASURE=1 EXCERPT_PHASE7_UNIQUE_ASSETS=1 CLANG_MODULE_CACHE_PATH=/private/tmp/excerpt-phase7-clang swift test --package-path apps/mac --disable-sandbox --cache-path /private/tmp/excerpt-phase7-swift-cache --filter Phase7MetricsTests`.
- Times are observed single-run values, not timing assertions. Logical bytes
  written are atomic replacement-file sizes, not physical write amplification.
  The benchmark includes native bridge dispatch and JSON responses, but not
  WKWebView rendering, keyboard event delivery, or actual capture hardware.

| Measure | First pass | Current second pass |
| --- | ---: | ---: |
| Full inline meeting JSON | 29,629,906 B | 29,629,826 B before extraction |
| Saved meeting metadata after edits | 29,629,906 B | 163,104 B |
| Full library bridge response (legacy comparison) | 30,499,538 B | 30,499,538 B |
| Actual library bridge response | 19,277 B | 19,277 B |
| Broad search response (100 hits) | 33,277 B | 33,277 B |
| Native list + bridge response | 43.5 ms | 6.7 ms warm; 11.7 ms after store reopen |
| Native search + bridge response | 43.3 ms | 7.8 ms |
| Cold full meeting load | 26.0 ms | 19.6 ms, including image hydration |
| Title edit atomic file replacement | 89.5 ms / 29.6 MB | 6.6 ms / 163 KB |
| Title mutation bridge request | not recorded | 218 B |
| Title mutation acknowledgment | full meeting, about 29.6 MB | 160,014 B; no duplicate editor-origin event |
| Title mutation through bridge | not separately recorded in first pass; 282 ms just before this change | 7.9 ms |
| 20 sequential title mutations | not recorded | mean 8.0 ms, max 8.7 ms |
| Caption / note wording mutation | not recorded | 8.0 / 8.2 ms |

The persisted `library-index` sidecars hold only summaries and searchable text.
They are validated against meeting file size, nanosecond modification time, and
inode. Missing, stale, or corrupt indexes rebuild from the authoritative file;
no whole-library rewrite occurs on launch. In-memory full-meeting/asset caches
are capped at two meetings, and library record cache at 128. Twenty searches in
each of ten batches took 1.54 seconds total. Current resident memory rose from
about 232 MB to 245 MB over seven batches, then fell to 185 MB before ending
near 189 MB; this run did not show monotonic retained growth. Peak process RSS
was about 280 MB, which is not comparable to the shorter first-pass process.

The first save of the repeated-image fixture took 20.2 ms, wrote one 982,338-byte
content-addressed asset (identical screenshots deduplicate), and left compact
meeting metadata. With 30 **distinct** valid PNGs, the assets totaled
29,683,668 bytes; initial save took 68.3 ms, compact metadata was 170,391 bytes,
and a later title edit took 5.8 ms. This is a native storage measurement, not a
claim about screenshot capture latency or UI feedback.

## Durability and compatibility

Image data URLs remain the editor's in-memory and export contract. Native storage
writes content-addressed, versioned image files first, verifies newly written
bytes against their digest, then atomically replaces only the small meeting or
draft metadata with asset references. A crash before metadata replacement leaves
the previous inline or compact record readable; orphan assets can be ignored.
Legacy inline data URLs still load and are migrated only when that individual
meeting is next saved. Recovery image and draft checkpoints use the same assets.
A missing or invalid referenced asset fails a cold meeting or recovery read rather
than silently dropping its image; failed recovery keeps its journal for retry.
Editor-origin applied acknowledgments omit image
bytes only after native durability; the editor restores known images or reloads
the full meeting if an image is unknown. Rebased/conflicting replies retain full
authoritative data. Transcript corrections send updated image metadata but omit
the unchanged data URLs; native restores them by image ID. Library rename uses a
small native result without loading images across the bridge.

Automated regressions cover index reopen/staleness, byte-for-byte legacy
migration, failed metadata write, missing asset, bounded full-image cache,
captured-image checkpoint → finish → caption edit → cold reopen → search, compact
acknowledgment rehydration/fallback, library rename, and an offline HTML export
containing 30 image tags with edited captions. The automated HTML fixture checks
output shape; the native save panel was subsequently exercised below. Offline
browser rendering was not checked.

## September 25 real WKWebView fixture run

A debug fixture app with separate bundle ID `com.excerpt.phase7fixture.a67d7b`
was launched on this Mac. Its `Info.plist` points to a marked synthetic-only
`/private/tmp/excerpt-phase7-ui-20260925-a67d7b` root; the app rejects an
unmarked or non-temporary root before creating `MeetingStore`. That root was
seeded by the opt-in Phase 7 metrics test with 100 meetings, including the
90-minute, 30-image meeting. The fixture app has separate UserDefaults and an
ad-hoc signature; the normal Excerpt app, meeting store, and permissions were
not changed. This temporary app and fixture remain available until cleaned by
the user or the system.

The real app's WKWebView displayed all 100 synthetic meetings. Search for an
edited image caption returned the heavy meeting. Title, first note bullet, and
image caption were edited in the UI; the `Saved on this device` state appeared,
the isolated JSON contained all three edits, and all three remained visible
after returning to the library and reopening the meeting. The native Save HTML
panel wrote `phase7-ui-check.html` inside the fixture root. The 28 MB file
contains 30 embedded PNG data URLs and the edited title, note, and caption.
An initial automated title typing attempt raced field focus and lost its first
character; after explicitly waiting for focus, the full typed title appeared
and persisted. This is an automation observation, not evidence of a product
keystroke loss bug.

The computer-use call durations include accessibility capture and input
delivery, so they are **not** WKWebView paint, keystroke-to-paint, or save-feedback
latency measurements. At the time of this first run, no microphone, screen
recording, TCC grant, live caption, offline browser rendering, or
repeated-meeting GUI memory run had been performed.

## September 25 public YouTube capture smoke test

With the user's Screen & System Audio Recording grant for the separate fixture
app, the app was quit and relaunched, then started a meeting while a public
GitLab Unfiltered YouTube staff-meeting video played in Arc. The live notes UI
showed an advancing meeting clock and a populated transcript. The capture was
ended by quitting the fixture app, and the resulting meeting reopened from its
isolated library after relaunch. The production Excerpt meeting store was not
used. This was a functional capture smoke test, not a timed acceptance run.

The saved record has `startedAt` 02:41:38 UTC and `endedAt` 02:45:54 UTC (4m16s),
`finishReason: stopped`, and 14 final transcript events: 11 remote and 3 marked
`you`. The saved meeting and library index were present, and on-device note
generation subsequently reached `ready`. The `you` attribution was not
validated against intentional microphone speech; it could include ambient
pickup or playback bleed. No transcript wording or potentially private local
audio is reproduced here. The floating caption overlay was **not** independently
verified in this run, nor were caption latency, long-session behavior, or
offline HTML browser rendering.

## September 25 full-journey fixture verification

The separate fixture app was used for a second public-video meeting, with its
microphone and system-audio sources enabled. Preferences displayed the selected
MacBook Air Microphone as connected, on-device Apple Intelligence selected,
captions enabled, and the configured meeting/capture shortcuts. During the
meeting, the live notes clock advanced and a manually typed paragraph showed
`Saved on this device`. A local Excerpt artwork PNG was imported into the live
document through the native file picker and captioned. While that meeting was
still live, a previous saved meeting was renamed and remained in the library.
The fixture warned that microphone playback bleed could duplicate heard words;
the test used speakers rather than headphones, so transcript quality and
speaker attribution from this run are not acceptance evidence.

The physical End shortcut (⌘⇧R) finalized the second meeting through the
normal path, with `finishReason: stopped`, seven final transcript events, and
one saved image. The finished meeting reopened automatically, persisted after
quitting and relaunching the app, and was found by searching its image caption.
A transcript correction persisted with `sourceRevision: 1`. In the prior saved
meeting, changing an extracted next-step's wording and marking it done carried
through to its detailed review view, indicating the same extracted item was
edited rather than duplicated. The notes source panel opened to a cited passage.

The native export panel saved a 95 KB HTML file containing the edited caption
and one embedded image under the fixture root as `phase7-full-journey.html`.
Arc opened that local `file:` page and rendered the image and caption. The
browser was not disconnected from the network, so this demonstrates a
self-contained local export, not an air-gapped offline test.

**Confirmed defect from the September 25 fixture:** the manually typed live paragraph appeared once before
End but twice in the finished meeting. The saved JSON contains two paragraph
blocks with identical text *and the same block ID*
`985e8995-ac72-4cb3-bcd2-d18ce8baffcb`. Both copies remained after a cold
relaunch and appeared in the exported HTML. This is persisted document
duplication, not merely a transient UI render. The isolated record is
`m-1790305186995-5183793c-54f5-4e1f-815e-f3d910904330` under the marked
temporary fixture root. The root cause was the enhancement failure path composing
an already-composed extractive fallback a second time: handwritten blocks have no
source evidence, so the reconciliation treated the same durable block ID as new
wording and appended it. The current fix matches block identity before evidence,
enforces unique block IDs at reconciliation, and has TypeScript plus native
provider-failure regressions. The original live journey still needs to be rerun,
so the full user journey is not yet called verified.

The native Capture moment shortcut opened macOS's region selector during a
third short fixture meeting. Cancelling it with Escape correctly left that
finished meeting with zero images. In a fourth short fixture meeting, Arc was
focused on the local test export page before the physical ⌘⇧S shortcut. The
user observed Excerpt come forward behind the selection crosshair, obscuring
the intended Arc page, and cancelled instead of capturing the wrong content.
This is a **Capture moment UX failure** in the tested build, not a successful
end-to-end screenshot insertion. The implementation invokes `screencapture -i`
and hides the floating captions, but does not explicitly hide the main notes
window before selection; that is a plausible mechanism, not a proven root
cause. Floating caption presentation, first-run setup, latency targets, and
repeated-session memory remain unverified.

## Remaining gate work and exceptions

- Real WKWebView title typing and saved feedback were functionally exercised on
  the isolated fixture, but keystroke-to-paint, confirmed-save latency, caption
  presentation, and warm library paint are **not measured**. An earlier offscreen
  WKWebView test attempt did not complete under the Swift test runner and was
  removed; no UI timing is inferred from native bridge or computer-use latency.
  Instrument the running fixture app before claiming the <100 ms steady input,
  <1 s saved feedback, and <1 s warm-library targets.
- The initial full meeting open still transfers images for editing and offline
  HTML export. That is intentional; repeated library/search/edit acknowledgments
  no longer transfer them. The UI export save path worked with synthetic data;
  two short public-video captures worked in the isolated fixture. A local HTML
  browser render worked; network-isolated rendering and repeated meetings under
  hardware/GUI load still require acceptance testing. The live-paragraph fix passes
  the exact native fallback regression; rerun that case in the signed fixture before
  passing the user-journey gate.
- Asset files made orphaned by an interrupted migration are harmless but are
  not yet reclaimed automatically. Do not introduce eager whole-library cleanup.

Current status: **Phase 7 in progress**, not through its real-app gate. Phase 8
real-device and signed-package acceptance remains separate.

## September 25 native screenshot handoff follow-up

The screenshot action already used macOS `screencapture -i`, and a successful
selection was already checkpointed into the active meeting with its meeting
time. The foreground fix now hides Excerpt's windows before opening that
system picker and restores the prior visibility/focus afterward, including
when End or Quit cancels the picker. A focused Swift regression covers a chosen
capture reaching the live meeting and surviving End; two handoff tests cover
inactive-app restoration without focus theft, prior active-app restoration,
and an already-hidden app staying hidden. Full native `swift test` passed
**189 tests in 27 suites**; `git diff --check` passed.

The visual picker retest is **pending**, not passed. Updating the ad-hoc signed
fixture executable invalidated its Screen & System Audio Recording grant, and
the rebuilt fixture still reported denied after a restart. Do not ask the user
to repeat permission toggles for each build; package a final test build with a
stable local signing identity before another live fixture pass. The prior
duplicate-live-paragraph defect now has an automated fix; its live retest remains
separate and pending.

The user clarified that their intended capture flow is macOS's ordinary
⌘⇧4/⌘⇧5 shortcuts. The native app now watches the system screenshot save
location only while a meeting is listening, baselines files already there,
requires macOS's screenshot file marker, waits for file size/modification time
to settle, then checkpoints each new image at its file creation time. It does
not capture the screen itself, import unrelated images, remove or alter the
saved screenshot, or watch the clipboard. Changing the screenshot save folder
during a meeting is supported; clipboard-only and Preview/Mail destinations
are not file imports. The focused synthetic test verifies one import survives
End while old, unrelated, duplicate, and post-stop files are ignored. A live
⌘⇧4/⌘⇧5 fixture pass remains pending with a stable test-app identity.
After the duplication follow-up, full native `swift test` passed **192 tests in 27
suites**; core/editor JavaScript tests passed **222 + 43**, typechecks and the
engine/editor resource builds passed, and `git diff --check` passed. These automated
checks do not substitute for the pending live screenshot/focus pass.
