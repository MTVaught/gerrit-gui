# Proposal

## Why

Selecting a code line with its trailing newline places a new review comment below the following line. Both comment entry points treat the exclusive selection endpoint as an included source line, which also sends the wrong end line to Gerrit.

## What Changes

- Normalize a new comment selection that ends at column 1 of a later line to the end of the previous source line.
- Use the same conversion for the comment shortcut and the editor context menu, on either diff side.
- Keep the composer, saved draft, and reopened comment on the last selected source line. Handle a selection that contains only a newline as a line comment.
- Add regression coverage for selection direction, multiple lines, blank lines, source columns, and existing comment behavior.

## Capabilities

### New Capabilities

- `review-comment-anchors`: Convert code selections to stable comment lines and ranges for composition and storage.

### Modified Capabilities

None. Existing layout and reply specs require stable anchors but do not define how a new selection becomes a comment range.

## Impact

The change affects selection conversion in `ReviewEditor.tsx` and a shared helper in `review-comments.ts`, with unit coverage in `review-comments.test.ts` and input coverage in `test/review-comments-ui.cjs`. It uses the existing source models and Gerrit payload shape. No dependency, server, or data migration is needed. Existing comments, saved drafts, reply anchors, and suggested-fix replacement ranges retain their stored coordinates.
