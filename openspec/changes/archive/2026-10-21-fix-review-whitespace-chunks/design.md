# Design

## Context

See proposal.md for the reported behavior. `diffContents` reconstructs the source and keeps Gerrit's changed ranges and rebase ranges separately. `computeGerritDiff` processes each changed range. A range with content on only one side is emitted directly, so adjacent deletion and insertion ranges never reach whitespace normalization together. Merging the emitted highlights is too late to filter the body.

The current workspace already contains a candidate fix and regression fixtures from this session. The apply phase will audit those changes against the spec, reproduce the failure against the pre-change implementation, and run fresh verification.

## Goals / Non-Goals

**Goals:** Keep the existing worker, normalization, source-column mapping, and rebase decoration contracts. Limit the change to the ranges sent for local comparison.

**Non-Goals:** Replace the diff engine, infer semantic equivalence, move source text, change defaults, or add Gerrit account preference requests. Whitespace filtering follows the selected policy even in languages where indentation can affect behavior.

## Decisions

1. Combine consecutive changed ranges before computation when the mode is not IGNORE_NONE. Ranges must meet on both source sides. Copy each input range before extending it, since the loaded file can be reused for later preference changes. Comparing separate one-sided ranges cannot identify equivalent lines; combining only the output ranges cannot remove their false highlights.
2. Keep every unchanged Gerrit line as an anchor. A whole-file diff could match repeated returns or braces across those anchors and damage rebase alignment. Grouping only touching ranges limits that risk.
3. Continue to normalize temporary comparison lines and map inner ranges back to the source. Keep the source models and rebase ranges unchanged. Reuse the current deadline and one-sided insertion/deletion fallback.
4. Verify the worker contract and the packaged Electron UI. Use synthetic Gerrit chunks with four statements, a new loop, one leading tab per statement, and a separate value edit. Use real pointer and keyboard input to select each whitespace mode. Record the None-to-All transition in both themes with the same framing and pace.

## Risks / Trade-offs

- Grouping can change alignment within a changed region. Unchanged anchors, exact-range regression assertions, and existing rebase UI checks limit this risk.
- Mutating input ranges could affect later mode switches. Copy range tuples and verify the request remains unchanged.
- Synthetic chunks reproduce the identified failure but do not establish the exact chunk structure of the user's private diff. State that limit in the evidence report.
- T3 preview previously failed because the host blocks its browser sandbox. If the same limit remains, use the repository's isolated Electron/Xvfb workflow without changing host settings.

## Migration Plan

No stored data or preference migration is needed. Ship the worker change with the existing application build. Reverting the change restores the previous computation behavior without changing stored preferences or source content.
