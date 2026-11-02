# Proposal

## Why

All comments combines discussions from all patch sets. Reviewers need to limit that list to a patch set without changing the code comparison.

## What Changes

- Add a Patch set selector beside Show and Author, with All patch sets selected by default.
- Offer each patch set represented by a published comment or draft, in descending numeric order.
- Show complete threads containing a comment on the selected patch set. Combine this condition with the existing status and author filters.
- Show a clear message when no threads match.
- Verify the workflow and layout in light and dark mode with simulated Gerrit data.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `review-comment-overview`: Filter complete threads by their original patch set while preserving review continuity.

## Impact

The renderer's ReviewComments component and its Electron UI tests change. No Gerrit API changes or new dependencies are needed.
