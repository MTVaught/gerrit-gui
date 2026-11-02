# Proposal

## Why

Mark all unreviewed briefly clears files, then Gerrit restores their flags from an older patch set. A reset must remain saved after status refresh and reopening the review.

## What Changes

- Keep an explicit empty review state on Gerrit before clearing file flags.
- Hide the internal state marker from file counts, filters, and reset targets.
- Preserve older patch sets, other users, normal marking, and save-error recovery.
- Add regression checks that reproduce Gerrit's flag inheritance and verify the desktop workflow with real Gerrit 3.11.2.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `reviewed-files`: Explicit unreview actions must survive Gerrit's inheritance of flags from older patch sets, including after a review is reopened.

## Impact

The change affects the Gerrit client's reviewed-file reads and writes, their unit tests, existing desktop checks and recording runners, and the testing guide. Each unreview write adds an idempotent marker PUT before its DELETE. No renderer API, dependency, server configuration, or credential format changes are required. Verification uses generated changes and dummy accounts on a temporary local Gerrit instance.
