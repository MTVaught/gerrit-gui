# Proposal

## Why

The dashboard shows CI results and review progress but does not show merge conflicts. A small warning beside the patch set lets users see a conflict without adding a banner or increasing row height.

## What Changes

- Read Gerrit mergeability for public and private open changes already visible on the dashboard, including each branch and sequence member.
- Show a small amber/yellow warning triangle immediately before the Verified check or X. Show the triangle on its own when CI has not voted.
- Give the triangle hover text and an accessible name that identify the conflict and destination branch.
- Use readable theme variants in standard cards and the compact ledger.
- Keep unknown mergeability distinct from a confirmed conflict. Refresh the indicator when the destination branch changes, even if the patch set has not changed.
- Keep review states, counts, grouping, tray summaries, permissions, and action availability unchanged. No conflict pill, explanation banner, new button, automatic rebase, or conflict editor is included.

## Capabilities

### New Capabilities

- `merge-conflict-indicators`: Read and display per-change merge-conflict warnings beside CI results, with refresh and unknown-data behavior.

### Modified Capabilities

None. The existing workflow-state-colors and change-count-summaries requirements remain in force.

## Impact

The change affects Gerrit reads in `src/main/gerrit.ts` and `src/main/dashboard.ts`, shared change data, dashboard cache refresh behavior, the patch-set indicators in `ChangeRow.tsx` and `Ledger.tsx`, and theme styles. It needs no new runtime dependency or Gerrit write endpoint. Servers that omit query mergeability need bounded additional read requests.

The paired simulated application mockups linked in design.md show the intended icon placement. Earlier mockups disabled Ready to Merge; that behavior is not part of this proposal.
