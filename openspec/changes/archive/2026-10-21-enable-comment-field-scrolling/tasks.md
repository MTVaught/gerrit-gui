# Tasks

## 1. Internal field scrolling

- [x] 1.1 Extend `test/review-comment-scroll-ui.cjs` to enter a numbered multiline comment and reproduce the wheel conflict using real input. Record textarea and both pane scroll offsets; confirm the new internal-scroll assertion fails before the fix while existing selected-line checks still pass.
- [x] 1.2 Add a native wheel listener at the shared composer DOM boundary in `ReviewComments.tsx`, with lifetime cleanup and current overflow checks. Retain default text scrolling and modified zoom gestures. Verify the regression test scrolls up and down without changing focus, message, code offsets, or initiating an extra draft write.
- [x] 1.3 Add overflow-dependent vertical overscroll containment for composer fields. Extend the same workflow to both text boundaries, fallback dialog position, short fields, scrolling over code and controls, and resizing until text fits. Verify the expected field or outer container owns each gesture.

## 2. Composer and layout compatibility

- [x] 2.1 Extend comment UI coverage for replies, edited drafts, suggested-replacement fields, and reopening. Use the existing fixture and real input; verify each field scrolls independently, keeps its full text, and preserves draft identity and original anchors through autosave and Save.
- [x] 2.2 Cover original and modified panes plus unified layout in both themes. Verify keyboard caret navigation, selection, native scrollbar drag, resize, and Cancel, and retain the current selected-line position checks. Document any unavailable physical trackpad or OS verification in the verification report.

## 3. Integration and visual evidence

- [x] 3.1 Run `pnpm test`, `pnpm typecheck`, and the relevant built Electron comment UI workflows, including `test/review-comments-ui.cjs` and `test/review-comment-scroll-ui.cjs`. Record commands, results, and the tested runtime in this change's verification report.
- [x] 3.2 Use the `record-actions` skill to capture matching light and dark videos of real scrolling in a long comment, boundary containment, and normal code scrolling after the pointer leaves the field. Keep the pointer visible, hover about two seconds before clicks, use brief captions, and pause on the results. Save files with `-light` and `-dark` suffixes; inspect both for matching data, view, pacing, and readable results. State that Gerrit data is simulated and name the tested platform. If capture remains blocked, record the exact limitation and mark visual verification incomplete.
