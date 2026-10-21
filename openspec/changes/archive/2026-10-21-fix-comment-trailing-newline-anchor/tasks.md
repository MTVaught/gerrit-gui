# Tasks

## 1. Normalize fresh comment selections

- [x] 1.1 Add a pure selection-to-comment helper in `review-comments.ts` with ordered bounds and a source-line-length reader. Verify in `review-comments.test.ts` that trailing-newline selections end on the preceding source line, ordinary and reverse selections keep the correct coordinates, and newline-only selections become line comments.
- [x] 1.2 Add boundary tests for multiline selections, final blank lines, a file-ending newline, line 1, tabs, Unicode, and CRLF model coordinates. Verify with `node --test src/renderer/src/review-comments.test.ts`, including that ordinary selections do not read source-line lengths and boundary adjustment reads only the final included line.

## 2. Use normalized coordinates in the review editor

- [x] 2.1 Route both `ReviewEditor.tsx` selection conversions through the helper using the selected editor's model. Extend `test/review-comments-ui.cjs` to use real input for the shortcut and context menu, and verify composer placement plus captured draft line/range on original and modified sides, including a base-patch-set comparison, in split and supported unified views.
- [x] 2.2 Extend the UI regression to autosave, Save, close and reopen a normalized draft, including a wrapped line. Verify the saved and restored coordinates stay on the last selected source line without changing source-request counts or rendering the complete file.
- [x] 2.3 Cover a stored range ending at a later line's character 0, replies to that range, and suggested replacements. Verify stored anchors and supplied replacement ranges remain unchanged, a new suggestion uses the adjusted range, and newline-only comments do not offer a range-based suggestion. Document the boundary behavior and focused command in `docs/testing.md`.

## 3. Validate the complete workflow

- [x] 3.1 Run `pnpm test`, `pnpm typecheck`, and `pnpm build`, then run the comment and ported-reply UI workflows documented in `docs/testing.md`. Verify selection fixes pass alongside existing reply, draft lifecycle, and suggestion checks.
- [x] 3.2 Use the record-actions workflow to capture the same control and trailing-newline selection before and after the fix with native input. Save matched light/dark MP4s and screenshots with a visible pointer, action captions, and equal framing, data, and scroll position. Inspect both exports and record saved request coordinates and test-platform/fixture limits with the evidence.
