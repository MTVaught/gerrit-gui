# Proposal

## Why

My Changes mixes workflow states, sequence cards, privacy, and an unexplained remainder in its count pills. Users cannot reliably connect those numbers to their changes, and conflicting state colors elsewhere make the numbers harder to interpret.

## What Changes

- Count each public open change displayed in My Changes once, including individual cherry-picks and sequence members owned by any user. Exclude private, merged, and abandoned changes, and changes in cards outside this tab.
- Show six numeric segments in fixed order: Needs changes, Ready to merge, Approved, In review, Iterating, In progress. Combine pass-around and in-person review into In review. Omit zero segments; show no count when all six are zero.
- Remove the sequence count, private count, remainder, and total from My Changes. Keep counts independent of View filters, and keep segments informational rather than interactive.
- Use red, purple, green, indigo, amber, and gray respectively for those states throughout the application, with light and dark variants. Preserve each other tab and tray indicator's existing counting and eligibility rules.
- Remove section-heading counts from every tab in standard and compact views. Keep branch counts and sequence size. Remove state totals from family and sequence headers.
- Retain numeric-only presentation without adding state labels or individual segment tooltips. Keep existing aggregate hover information accurate.

- Keep private changes out of sequence pickers and cards. Reject attempts to add private changes to a sequence. Remove the sequence tag when a change is made private.

## Capabilities

### New Capabilities

- `change-count-summaries`: My Changes state counts and count presentation at tab and section level.
- `sequence-privacy`: Keep private changes out of sequences and reject attempts to add them.
- `workflow-state-colors`: Consistent workflow-state colors across board, compact ledger, grouped summaries, tab pills, and tray indicators.

### Modified Capabilities

None. The project has no existing main specs.

## Impact

Shared counting and presentation metadata in `src/shared/model.ts`; tab rendering in `src/renderer/src/App.tsx`; section headings in `Board.tsx` and `Ledger.tsx`; state styling in `styles.css`; tray color consumers in `src/main/tray.ts`; nearby model tests, UI verification, and README documentation. No Gerrit data changes, new services, or dependencies are required. Card grouping and non-My Changes counting behavior stay unchanged. Private changes cannot be sequence members.
