# Claude Code prompt — finish Excerpt Phase 6

Work in the existing repository at `/Users/trey/Build Games/excerpt` on branch
`note-and-transcript-quality`. This is an implementation task: finish Phase 6,
add regressions, verify the gate, and update the handoff. The pushed starting
checkpoint is `0d36b71`; it contains completed Phase 5 and the first Phase 6
pass. Do not restart the desktop migration or create a new checkout.

Before editing, read `DESKTOP-IMPLEMENTATION-PLAN.md` (Phase 6 and the execution
ledger), `DESKTOP-REVIEW.md` (“After the meeting”),
`DESKTOP-PHASE-6-PROMPT.md`, and `DESKTOP-HANDOFF.md`. Run `git status` and inspect
the current branch, latest commit, and any complete diff, including untracked
files. The worktree was clean at `0d36b71`, but treat whatever you find now as
user work. Preserve it. Do not reset, stash, commit, or push without a request.

What is already done: Phases 0–5 passed automated gates. The default notes page
is primary; transcript and detailed review are secondary and reversible. Export
and rewrite controls are grouped, with accurate cancellation feedback and a
guarded one-step rewrite undo. Extraction priorities are under Advanced settings;
provider copy explains automatic OpenAI enhancement; library loading and rename
errors are recoverable. Baseline checks passed: 210 core tests, 26 editor tests,
170 Swift tests in 24 suites, typechecks, resource builds, caption-token check,
desktop-boundary audit, and `git diff --check`. These do not prove hardware or
signed-package acceptance.

Finish these Phase 6 gaps, making small, verified changes:

1. Make a finished meeting read as a concise, editable document: title and save/
   generation state, transcript-supported short summary, chronological topic and
   screenshot moments, and brief next steps. Hide empty sections. Keep every image
   once with its saved caption and document order. Never infer pixel content,
   unspoken decisions, or an owner from proximity.
2. Give next steps one underlying `Meeting.items` identity across the document
   and detailed review. Completion, assignment, and corrections must update the
   same persisted item through the typed native mutation path. Do not introduce
   two independently editable action copies. Preserve legacy decoding and add
   shared/native round-trip tests if the schema changes.
3. Make source and screenshot inspection reversible, including keyboard focus and
   document scroll position after a transcript correction. Keep detailed review
   optional but retain all existing item editing, evidence, and correction paths.
4. Verify the ordinary library/settings journey: Start, search, recent meetings,
   quick rename, deliberate delete, missing versus unavailable storage, caption/
   microphone settings, provider disclosure, and advanced extraction priorities.
5. Check focus order, labels, contrast, reduced motion, minimum window size, and
   keyboard writing. Keep the document calmer than the power-user controls.

Preserve Phase 5’s persistence and generation invariants: End saves useful visual
notes before optional enhancement; user writing, image placement/captions,
deletions, and corrections survive regeneration; live imports use the native
clock; finished imports may have unknown time; exports reflect saved order and
captions. Use only synthetic fixtures and isolated storage. Do not access real
meeting data, browser databases, Keychain entries, permissions, signing settings,
or external hosting; do not launch the app against production storage. Leave real
audio/display/sharing, long-session, and signed-package acceptance for Phase 8
unless you can test safely in scope, and report any unperformed checks exactly.

Add focused tests for the changed behavior. At the end run and report actual
results for `pnpm exec turbo test --force`, `pnpm typecheck`, `pnpm build:engine`,
`pnpm build:editor`, `pnpm --filter @excerpt/editor build`,
`node apps/mac/tools/sync-caption-tokens.mjs --check`,
`CLANG_MODULE_CACHE_PATH=/private/tmp/excerpt-phase6-clang swift test --package-path apps/mac --disable-sandbox --cache-path /private/tmp/excerpt-phase6-swift-cache`,
and `git diff --check`. Audit production source and generated bundles for live
browser capture, PiP, IndexedDB, and retired routes, distinguishing comments and
legacy decoding from implementation.

Update the **execution ledger** in `DESKTOP-IMPLEMENTATION-PLAN.md` and
`DESKTOP-HANDOFF.md` with actual changed behavior, test counts, unresolved risks,
working-tree state, and the exact next step. Mark Phase 6 complete only when its
gate is supported; otherwise leave it `in progress` and state what remains.
