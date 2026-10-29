# Tasks

## 1. Reset operation and state

- [x] 1.1 Add a reset operation in `LocalReview` that snapshots all reviewed paths for the target patch set and clears them sequentially through the existing API. Add focused tests for hidden paths, paths outside the comparison, pseudo-files, empty status, and target isolation. Verify only confirmed deletes update local state.
- [x] 1.2 Hold a guard for the full reset and status reconciliation. Extend closure, comparison, per-file, keyboard, and automatic-marking checks. Test duplicate activation, a pending per-file mark, blocked connection, and a connection change between requests. Verify no conflicting writes or stale updates occur.
- [x] 1.3 Stop on first failure, retain confirmed clears, show a reset error, and reconcile server status before retry. Test first-write failure, partial failure, retry of remaining paths, and late status responses. Verify failed paths never appear cleared.
- [x] 1.4 Preserve the current automatic-marking visit marker across reset and retry without changing preferences. Test automatic marking enabled during success, refresh, and partial-failure retry. Verify it resumes after file navigation.

## 2. File-list control

- [x] 2.1 Add the heading glyph button, tooltip, pending indication, callback, and disabled states to `ReviewFileList` and wire them to `LocalReview`. Verify pointer, Enter, and Space activation, unavailable status, no reviewed paths, and zero visible reviewed files with reviewed paths outside the comparison.
- [x] 2.2 Style the compact button beside Files and the reviewed count in the same heading within the existing pane limits. Inspect both themes at normal and minimum pane widths. Verify the count, filter, file labels, resize separator, and keyboard focus stay readable and accessible.

## 3. Integration and evidence

- [x] 3.1 Run `pnpm test`, `pnpm typecheck`, and strict OpenSpec validation. Exercise embedded and separate review windows, reopen the target patch set, and verify confirmed flags persist and reach a second view while comments, votes, selection, and unsaved text remain intact.
- [x] 3.2 Use the `record-actions` skill to record the same filtered reset workflow in light and dark mode on Linux. Keep the pointer visible, hover two seconds before each click, add brief captions, and pause on the result. Save paired `-light` and `-dark` videos, inspect both, and link them in the completion report. State simulated data or failures and any incomplete platform or visual checks.
