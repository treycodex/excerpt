# Phase 6 continuation prompt — Excerpt desktop

Continue implementing Phase 6 in `/Users/trey/Build Games/excerpt` on
`note-and-transcript-quality`. Do the work in the existing worktree; do not create
a new checkout or reconstruct earlier phases. First read
`DESKTOP-IMPLEMENTATION-PLAN.md` (Phase 6 and its execution ledger),
`DESKTOP-REVIEW.md` (especially “After the meeting”), and
`DESKTOP-HANDOFF.md`. Then inspect `git status`, `git log -1`, and the full diff,
including untracked files. The pushed base is `42c5dbe`; Phase 5 and the first
Phase 6 pass are intentionally uncommitted. Preserve all existing work. Do not
reset, stash, commit, or push unless the user asks.

Phases 0–5 have passed their automated gates. Full Xcode is available. The first
Phase 6 pass made the notes document primary; moved transcript and detailed review
to secondary, reversible views; grouped copy/Markdown/HTML export and rewrite
controls; added a guarded one-step rewrite undo; moved extraction priorities into
Advanced settings; clarified that OpenAI selection affects automatic enhancement;
and made library load/rename failures recoverable. Do not rebuild those features
from scratch. Current evidence: 210 core tests, 26 editor tests, 170 Swift tests
in 24 suites, typechecks, generated-resource builds, caption-token check,
desktop-boundary audit, and `git diff --check` passed. These are automated
results, not real-device acceptance.

Finish the remaining Phase 6 product work:

1. Make the default finished document read as an editable title, concise
   transcript-grounded summary, chronological topic/moment sections, and short
   next steps. Hide empty sections. Keep every saved screenshot once, in its
   documented order, with its saved caption; do not infer image contents or owners.
2. Give next steps one underlying `Meeting.items` identity across the document and
   detailed review. Completion, assignment, and wording corrections must persist
   through the same typed native mutation path. Do not create a second independently
   editable action list or discard a reader-edited document during regeneration.
   If a schema field is needed, preserve legacy decoding and add TypeScript/Swift
   round-trip tests.
3. Make source and screenshot context reversible and keyboard-accessible: opening a
   passage, correcting it, and returning should preserve document position/focus.
   Keep optional detailed review available, without making it a required ritual.
4. Check the library and settings journeys end to end: Start, search, recent,
   rename, deliberate delete, unavailable storage versus missing meeting, caption
   and microphone settings, provider disclosure, and advanced priorities. Fix any
   remaining loading or failure states that strand the reader.
5. Verify focus order, labels, contrast, reduced motion, minimum window size, and
   keyboard text editing. Keep the default document quiet and readable. Where a
   real native-app check would touch production storage or require hardware, use
   isolated synthetic fixtures or report the exact Phase 8 acceptance still open.

Preserve the Phase 5 invariants: End saves useful visual notes before optional
enhancement; live image imports use the native meeting clock; unknown-time imports
stay unknown until anchored; generated wording never erases handwriting, image
placement, edited captions, or deletions; source corrections invalidate stale
generation; export order/captions match the saved document. Do not access real
meetings, browser databases, Keychain entries, permissions, signing settings, or
external hosting. Do not claim a signed release without an authorized identity.

Add focused regressions for the changed user journey and native/shared contracts.
At the end, rerun and record actual results for:

```sh
pnpm exec turbo test --force
pnpm typecheck
pnpm build:engine
pnpm build:editor
pnpm --filter @excerpt/editor build
node apps/mac/tools/sync-caption-tokens.mjs --check
CLANG_MODULE_CACHE_PATH=/private/tmp/excerpt-phase6-clang swift test --package-path apps/mac --disable-sandbox --cache-path /private/tmp/excerpt-phase6-swift-cache
git diff --check
```

Also audit production source and generated bundles for browser capture, PiP,
IndexedDB, and retired routes, distinguishing comments/legacy decoding from live
implementation. Update Phase 6 in the plan's **execution ledger** and refresh
`DESKTOP-HANDOFF.md` with changed behavior, tests/counts, unresolved risks,
working-tree state, and the exact next step. Mark Phase 6 complete only if its
gate is supported. Otherwise keep it in progress and say precisely what remains.
