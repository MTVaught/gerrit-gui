# Proposal

## Why

The review window can highlight every line when existing code gains one tab of indentation inside a new loop, even when Ignore Whitespace is All. Separate adjacent Gerrit deletion and insertion chunks prevent the local filter from comparing those lines, which hides the actual changes among false highlights.

## What Changes

- Apply the selected whitespace policy across adjacent changed chunks while keeping unchanged Gerrit lines as comparison boundaries.
- Leave tab-only indentation changes without highlights under All and Leading and trailing. Keep new loop headers, braces, and other code edits highlighted.
- Preserve source text, source positions, rebase metadata, and the behavior of None and Trailing.
- Add regression tests and paired light and dark UI recordings using the loop example.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `review-preferences`: Define whitespace filtering across Gerrit chunks, including mixed code and indentation edits.

## Impact

The change affects the local review diff worker, its tests, and the Electron review fixture and capture workflow. It needs no new dependencies, server API changes, or preference migration. Existing uncommitted implementation and evidence are available in this workspace; apply will verify them against this contract and generate fresh proof.
