# Tasks

## 1. Diff computation and regression tests

- [x] 1.1 Reproduce the loop and tab failure against the pre-change worker and verify regression coverage for tab-only edits, loop wrapping, both chunk orders, source columns, unchanged anchors, and input immutability. Save the before/after comparison and pass `node --test src/renderer/src/review-diff.test.ts`.
- [x] 1.2 Apply or audit adjacent-range grouping for whitespace modes, preserve source and rebase metadata and the None behavior, and verify the diff, preference, and rebase range unit tests pass.

## 2. Review interaction and visual proof

- [x] 2.1 Apply or audit the synthetic loop fixture and UI check. Verify all four whitespace selections through real input, exact visible highlights, and one content request per review in both themes.
- [x] 2.2 Generate fresh paired light and dark recordings and result screenshots after apply. Inspect both modes, decode each video, and update the evidence README and machine-readable results with test scope and the synthetic-data limit.

## 3. Integration verification

- [x] 3.1 Pass strict validation of this OpenSpec change, the full unit suite, typecheck, build, and the existing review navigation and rebase UI checks. Record the results and verify `git diff --check` passes.
