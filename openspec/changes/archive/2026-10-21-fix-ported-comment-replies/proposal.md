# Proposal

## Why

On Gerrit 3.11.2, replying to an older comment from a newer patch set causes the same reply to appear twice in Gerrit's web interface. The investigation confirmed that the app saves the reply at its mapped display position while retaining the older parent ID.

## What Changes

- Save Reply, Quote, Ack, and Done responses with the parent comment's original patch set, path, side, merge parent, line, and range.
- Keep the reply composer and saved drafts at the mapped thread location in the active comparison without using that location for writes.
- Preserve autosave, editing, cancel, discard, resolution, and explicit publication behavior for replies saved on older patch sets.
- Replace the UI test expectation that currently requires a mapped write anchor. Add coverage for renamed files, ranges, base-side comments, reply chains, and publication scope.
- Verify the fix against real Gerrit 3.11.2, including one stored reply and one displayed occurrence in its web interface. Capture the same workflow in light and dark mode.

## Capabilities

### New Capabilities

- `review-comment-replies`: Original reply anchors, mapped display placement, draft lifecycle, and publication of replies from the built-in review tool.

### Modified Capabilities

None. The existing overview and navigation specs retain their current requirements. They do not define reply write coordinates.

## Impact

- Renderer comment composition and display in `src/renderer/src/components/ReviewComments.tsx`, with comment anchor helpers in `src/renderer/src/review-comments.ts` as needed.
- Existing comment mapping and navigation in `LocalReview.tsx` if required to place newly saved replies without switching the comparison.
- Comment unit tests, `test/review-comments-ui.cjs`, its fixture, and a real-server regression workflow based on `test/reproduce-ported-reply.ts`.
- No REST API, settings, dependency, or storage schema changes. Existing published comments and saved drafts will not be migrated or rewritten.
- The investigation report and baseline captures remain available under `docs/investigations/ported-reply-duplication.md`.
