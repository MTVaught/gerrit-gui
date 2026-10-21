# Tasks

## 1. Original write anchors and mapped display

- [x] 1.1 Use the immediate parent comment's original anchor for Reply, Quote, Ack, and Done in `ReviewComments.tsx`. Add focused tests covering patch set, path, default and parent side, merge parent, line, range, and reply-chain target ID; verify the comment unit tests pass.
- [x] 1.2 Resolve composer and saved-reply display placement separately from the write anchor, using the known parent thread while a new draft ID has no mapping. Cover direct mapping, missing mapping, comparison changes, and cycle protection in helper tests; verify Save and draft editing preserve the active file and comparison without a second composer or source refetch.

## 2. Draft lifecycle and UI regression coverage

- [x] 2.1 Replace the historical reply expectation in `test/review-comments-ui.cjs` with patch set 1, `old-scheduler.ts`, line 9998. Extend the fixture and UI checks for Reply, Quote, Ack, Done, renamed paths, and All comments navigation; verify each request retains the original anchor while the composer stays at the mapped location.
- [x] 2.2 Extend the UI checks for typing during creation, autosave followed by Save, resolution changes, editing and Cancel, new-reply Cancel, discard, and reopen. Verify one draft ID is reused, original coordinates remain stable, deletions target the saved patch set, and failed saves retain text for retry.
- [x] 2.3 Check all-drafts, selected-patch-set, and KEEP publication with an older reply draft. Verify the publish list, count, payload IDs, and remaining drafts match each scope; update `docs/testing.md` with the corrected original-anchor behavior and the command that runs these checks.

## 3. Real Gerrit regression and evidence

- [x] 3.1 Add a repeatable regression against a throwaway seeded Gerrit 3.11.2 that drives the built renderer with real input. Reuse fixture setup from the investigation where useful, document the command, and verify the captured requests, one stored reply ID, original parent and anchor, no remaining private copy, and one displayed occurrence within the original thread in Gerrit's web diff. Keep the intentional bad-payload diagnostic clearly identified.
- [x] 3.2 Use the `record-actions` skill to record the same reply and publication workflow in light and dark mode, then capture matching final screenshots. Inspect both exported videos and screenshots for readable controls, pointer movement, two-second hovers, and a single web reply; save files with `-light` and `-dark` suffixes and append the after results and platform/data limits to the investigation report without replacing the before evidence.

## 4. Integration checks

- [x] 4.1 Run `pnpm test`, `pnpm typecheck`, and `pnpm build`, then run the comment UI and overview workflows plus the real Gerrit regression against that build. Verify all checks pass and existing same-patch-set replies, standalone comments, summaries, overview continuity, and file virtualization remain correct; record the commands and outcomes in the change's verification notes.
