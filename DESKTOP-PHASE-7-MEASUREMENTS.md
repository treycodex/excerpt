# Phase 7 storage and bridge measurements — first pass

September 23, 2026. Synthetic data only, in an isolated temporary `MeetingStore`.
No production meeting, image, permission, Keychain item, or signing setting was read.

## Fixture and method

- MacBook Air (Apple M2, 8 cores, 16 GB), macOS 27.0. Debug Swift test process.
- One 90-minute meeting: 540 final transcript events, 90 note bullets, and 30
  2560×1440 valid PNG screenshots. The deterministic tile-pattern PNG is 736,737
  bytes; its base64 data URL is repeated for each synthetic capture. This models
  payload size, not the variety or decoding cost of real screenshots.
- 99 additional five-minute text meetings, for a 100-meeting library.
- `EXCERPT_PHASE7_MEASURE=1 CLANG_MODULE_CACHE_PATH=/private/tmp/excerpt-phase7-clang swift test --package-path apps/mac --disable-sandbox --cache-path /private/tmp/excerpt-phase7-swift-cache --filter Phase7MetricsTests`.
- Times below are individual runs, not latency guarantees or machine-stable
  assertions. "Logical bytes written" is the size of the atomic replacement file,
  not physical device-write amplification. RSS is process peak, not retained heap.

| Measure | Before lightweight library | After first pass |
| --- | ---: | ---: |
| Single PNG | 736,737 B | 736,737 B |
| Heavy meeting JSON | 29,629,906 B | 29,629,906 B |
| Full library bridge response | 30,499,538 B | legacy full-path comparison: 30,499,538 B |
| Actual library bridge response | 30,499,538 B | 19,277 B |
| Broad search bridge response (`launch timeline`, 100 hits) | not separate | 33,277 B |
| Heavy meeting save | 93.4 ms | 93.3 ms |
| Native full-library decode | 44.3 ms | 43.9 ms |
| Full-library JSON encode | 93.9 ms | 94.6 ms (comparison only) |
| Actual native list + bridge encode | about 138 ms (decode + full encode) | 43.5 ms |
| Native search + bridge encode | not available | 43.3 ms |
| Heavy meeting load | 28.1 ms | 26.0 ms |
| Title edit atomic save | 89.5 ms, 29,629,906 logical B | 89.5 ms, 29,629,906 logical B |
| Peak process RSS | 256,786,432 B | 259,866,624 B |

The bridge payload fell by about 99.94%. This first pass did **not** reduce native
disk reads or writes: listing/search still decode the image-heavy file, and a small
edit still atomically replaces that whole file. The ordinary editor now avoids
serializing unchanged image data URLs during mutation comparison, but the native
acknowledgment still returns a full meeting on each durable edit. Search is deferred
and debounced by 120 ms; the measured 43.3 ms is native work after the debounce,
not end-to-end typing latency.

## Remaining Phase 7 work

1. Measure full editor typing/caption feedback, bridge mutation and acknowledgment
   bytes, repeated-search memory, and a warm library rendered in the real app.
2. Bound repeated native JSON decoding and full-file writes. Try a lightweight
   persisted search/list index and bounded save coalescing before deciding whether
   versioned image assets are necessary. Preserve crash recovery and the rule that
   "Saved" means durable storage acknowledged the edit.
3. If image extraction proves necessary, design an atomic, restartable migration
   with legacy data-URL reads and verification before dropping inline bytes. Do not
   rewrite the user's whole library on launch.
4. Recheck capture/edit/reopen/search/HTML export with image-heavy fixtures and
   record actual latency, memory, and exceptions against Phase 7's targets.

Current status: **Phase 7 in progress**, not through its gate. Phase 8 real-device
and signed-package acceptance remains separate.
