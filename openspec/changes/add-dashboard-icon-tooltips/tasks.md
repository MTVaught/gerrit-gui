# Tasks

## 1. Shared tooltip behavior

- [ ] 1.1 Add a shared renderer tooltip with portal placement, theme styles, hover delay, focus support, accessible descriptions, and Escape dismissal. Verify through a focused UI check with actual hover and Tab/Escape input, including pointer travel into the tooltip and cleanup after unmount.
- [ ] 1.2 Check placement at viewport edges and inside scrolling cards and ledger containers. Verify that tooltip text stays visible in both themes and that trigger and row dimensions do not change.

## 2. Dashboard icon coverage

- [ ] 2.1 Integrate conflict and CI help in `PatchSetIndicators`, preserve actual vote and patch-set context, and remove competing native titles. Extend the simulated merge-conflict UI checks for pass, failure, conflict without CI, unknown data, and changed context after refresh in both dashboard layouts.
- [ ] 2.2 Integrate help for sequence completion, comment counts, branch families, sequences, and private indicators in standard cards and the compact ledger. Verify the displayed text and accessible descriptions with fixture data, including the difference between CI and sequence checks.
- [ ] 2.3 Integrate dashboard toolbar and row icon controls, including split-menu and reviewer actions, while keeping accessible names and original handlers. Verify real clicks and keyboard activation still perform each action, and hidden sizing content adds no focus stops.
- [ ] 2.4 Document tooltip coverage, input behavior, and the fixture check command in the project docs. Verify each documented command runs and its expected result matches the UI.

## 3. Integration and visual evidence

- [ ] 3.1 Run `pnpm test` and `pnpm typecheck`, then run the dashboard tooltip and existing merge-conflict UI workflows. Verify that states, icon order, counts, permissions, and actions retain their behavior.
- [ ] 3.2 Use the record-actions skill to capture matched hover, keyboard-focus, and Escape workflows in light and dark modes for both dashboard layouts. Use visible pointer actions and captions, and save paired videos with `-light` and `-dark` suffixes. Inspect both versions before sharing.
- [ ] 3.3 Capture and inspect matched light and dark screenshots of tooltip text and compact edge placement. Include both modes in the final response, identify the tested platform and simulated data, and state any remaining capture limitation.
