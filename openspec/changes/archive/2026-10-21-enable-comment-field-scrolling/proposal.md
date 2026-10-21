# Proposal

## Why

Reviewers need to read and edit long comments without moving the surrounding code. The reported problem is that scrolling over a comment text field does not scroll its text as expected. The inline host stops mouse-down and context-menu events, but lets wheel events reach Monaco, which can consume them.

## What Changes

- Let an overflowing comment text field scroll vertically with a mouse wheel or trackpad while the pointer is over it, with or without keyboard focus.
- Keep the diff position fixed during that gesture, including when the text reaches its top or bottom boundary.
- Preserve native keyboard navigation, text selection, scrollbar use, vertical resize, and draft saving.
- Apply the same behavior to new comments, replies, edited drafts, and suggested-replacement fields in the shared composer. Keep the fallback composer usable outside the diff.
- Verify the workflow in light and dark mode, in side-by-side and unified review layouts.

## Capabilities

### New Capabilities

- `review-comment-composition`: Text entry and internal scrolling in review comment composers, with stable surrounding review context.

### Modified Capabilities

None. The existing reply spec governs saved anchors and draft identity. The overview spec governs the thread list. Neither defines scrolling inside a text field.

## Impact

- Shared composer event handling in `src/renderer/src/components/ReviewComments.tsx` and scoped field styles in `src/renderer/src/styles.css` as needed.
- Inline host layout in `ReviewEditor.tsx` and focus behavior in `InlineReviewComment.tsx` must retain their current behavior.
- Extend `test/review-comment-scroll-ui.cjs` with real input and overflow checks. Retain the existing selected-line position checks.
- No new dependency, API, setting, or saved-data format. Published comment layout and review summary fields are outside this change.
- This proposal includes matched static previews. Real-input video evidence is an implementation task.
