# Tasks

## 1. Remove Gerrit account preference access

- [x] 1.1 Remove `LocalReview` account preference loading, conversion helpers, sync marker behavior, and Gerrit commit handling. Keep patch-set polling and reviewed-file behavior. Verify preference tests cover existing local values, missing or invalid records, Whole file default, and sync marker independence.
- [x] 1.2 Remove account diff preference methods and unused types from the shared API, browser adapter, preload, main IPC, service, and Gerrit client. Update service tests and all affected fixtures in the same task. Verify the removed methods are unavailable, no runtime reference remains, and reviewed-file and fix permission tests still pass.

## 2. Apply and persist edits automatically

- [x] 2.1 Add validated field updates against the latest confirmed local preferences. Keep last confirmed values on storage failure and report accessible per-field errors. Replace the old commit tests with tests for persistence, patch merging, partial failure, retry, and preserved successful edits.
- [x] 2.2 Replace dialog submission and staged preference state with automatic changes, buffered numeric input, and accessible validation. Remove Save, Cancel, and account sync copy. Add Close and automatic application copy. Update the review UI workflow and verify immediate changes, invalid entries, retained fixed width, Enter behavior, Escape, focus restoration, and saved values on reopening.
- [x] 2.3 Apply Diff theme selections through the shared application setting. Serialize asynchronous writes, reject stale UI results, retain errors across dialog dismissal, and permit retry through another selection. Update theme tests and verify rapid choices, delayed failure, Close during a pending write, unrelated preference edits, Appearance synchronization, and retained last confirmed theme after failure.
- [x] 2.4 Preserve the mounted review and editor during changes. Extend the review UI checks and verify the selected file, comparison, source position where layout permits, full-file content, and comment draft survive context, whitespace, font, width, and theme edits.

## 3. Verify desktop and browser outcomes

- [x] 3.1 Run the revised review and theme UI workflows in desktop and browser mode with simulated Gerrit data. Observe requests and verify zero account diff preference requests on review opening, preference opening, and every field edit. Verify ordinary review reads and permission checks still work, including local edits during read-only operation.
- [x] 3.2 Verify desktop restart and browser reload retain the latest valid settings. Include legacy local preferences, an inert sync marker, invalid persisted fields, unrelated application settings saves, and local storage failure with recovery. Record the observed outcomes with the fixture results.
- [x] 3.3 Run `pnpm test`, `pnpm typecheck`, and the relevant UI checks after the changes. Verify all required checks pass and document any concrete limitation.
- [x] 3.4 Use the `record-actions` skill to capture the automatic update, Close/Escape, and reopening workflow with real input in light and dark mode. Use matched framing, data, starting state, and pace; keep the pointer visible and hover about two seconds before each click. Inspect both videos, label simulated data and tested platforms, save paired `-light` and `-dark` artifacts, and include both in the completion response. Mark visual verification incomplete if a remaining capture limitation prevents runtime proof.
