# Proposal

## Why

Draft autosave can report a conflict with its own successful write because Gerrit 3.11.2 returns different timestamp precision for PUT and GET. Overall summaries in Reply also fail because the app sends source-position fields that Gerrit rejects, leaving Send review disabled.

## What Changes

- Compare saved draft timestamps at Gerrit's persisted whole-second precision, using the same version function in the renderer and desktop mutation guard.
- Keep real concurrent-edit, deletion, and publication protection. Further autosaves and explicit saves must update the same draft without a false conflict.
- Remove source-position fields from patch-set-level draft REST payloads so Reply summaries can autosave, update, clear, and publish.
- Make draft fixtures model the observed Gerrit responses and payload restrictions. Add real-server regression checks for a single embedded review and separate review windows.
- Capture the corrected workflows with real input in light and dark mode.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `review-windows`: Distinguish a draft's own save from a real concurrent change despite timestamp precision differences, while preserving existing conflict recovery.
- `review-comment-composition`: Require stable draft identity through successive saves and valid overall-summary draft payloads through their full lifecycle.

## Impact

The fix affects `src/shared/draft-version.ts`, draft serialization in `src/main/gerrit.ts`, and the existing comment/client/mutation/UI tests and fixtures. `ReviewComments.tsx` keeps its current controls, autosave timing, and summary composition model unless a regression test identifies a necessary adjustment.

No new dependency, setting, server extension, or stored-data migration is needed. Existing duplicate drafts remain available for manual review and deletion. Automatic duplicate cleanup and stronger atomic coordination with external Gerrit clients are out of scope.

The scope is based on [the real-server investigation](../../../../docs/investigations/draft-autosave-conflict.md), including its recorded requests and paired UI evidence. That evidence demonstrates the defects; implementation must supply separate evidence of the corrected behavior.
