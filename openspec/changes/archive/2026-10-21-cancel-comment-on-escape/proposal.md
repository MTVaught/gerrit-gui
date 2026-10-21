# Proposal

## Why

Escape while writing a comment closes the whole review. Reviewers need to cancel the comment and keep the review open.

## What Changes

- Treat Escape within a comment composer as its Cancel action.
- Keep the review open and use the existing rules for deleting a new draft or restoring an edited draft.
- Consume Escape while a draft write is pending, as Cancel is disabled then.

## Capabilities

### New Capabilities

- `review-comment-composition`: Keyboard cancellation of comment composition and draft edits.

### Modified Capabilities

None.

## Impact

The shared comment form in `ReviewComments.tsx` and focused Electron UI checks. No API or dependency changes. The review summary dialog keeps its existing dismissal behavior.
