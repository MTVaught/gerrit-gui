# merge-conflict-indicators Specification

## Purpose

Show merge conflicts beside patch-set CI results so users can identify affected changes without changing the dashboard's review workflow.

## Requirements

### Requirement: Conflict data has an unknown state

The dashboard SHALL use Gerrit mergeability for the current revision of each visible open change. Explicit false SHALL produce a conflict warning, true SHALL produce no warning, and absent or failed data SHALL remain unknown with no conflict warning. Submit approval, CI results, and missing votes SHALL NOT determine mergeability. A failed mergeability read SHALL NOT prevent the dashboard from loading.

#### Scenario: Confirmed conflict
- **WHEN** Gerrit reports an open change's current revision as not mergeable
- **THEN** that change shows a conflict warning

#### Scenario: Query omits mergeability
- **WHEN** a query returns an open change without mergeability
- **THEN** the application attempts a separate Gerrit mergeability read for that revision
- **AND** failure of that read leaves mergeability unknown while the change remains visible

#### Scenario: Approval is missing
- **WHEN** mergeability is true or unknown and Gerrit reports that submit approval is missing
- **THEN** missing approval does not produce a conflict warning

### Requirement: Compact warning beside Verified

Standard cards and the compact ledger SHALL show a small warning triangle after the patch-set number and immediately before the Verified check or X when a conflict is confirmed. The triangle SHALL appear on its own when there is no Verified vote. It SHALL use amber or yellow with readable variants in light and dark modes. The interface SHALL NOT add a conflict pill, explanation banner, or navigation button.

#### Scenario: CI passed with a conflict
- **WHEN** a conflicted change has Verified +1
- **THEN** its indicators appear in the order patch-set number, warning triangle, green Verified check

#### Scenario: CI failed with a conflict
- **WHEN** a conflicted change has Verified -1
- **THEN** its indicators appear in the order patch-set number, warning triangle, red Verified X

#### Scenario: CI has not voted
- **WHEN** a conflicted change has no Verified vote
- **THEN** the warning triangle remains visible after the patch-set number without a Verified glyph

#### Scenario: Same view in both themes
- **WHEN** the same conflicted change appears in light and dark modes, in standard or compact view
- **THEN** the triangle remains readable and the existing row height and CI color meanings are preserved

### Requirement: Warning identifies its meaning

The warning triangle SHALL have hover text and an accessible name of "Merge conflict with <branch>", where <branch> is the change's destination branch. The icon shape and text SHALL identify the warning without relying on color alone.

#### Scenario: Destination branch in the warning
- **WHEN** an open change targeting release has a conflict warning
- **THEN** its hover text and accessible name are "Merge conflict with release"

### Requirement: Warnings belong to individual open changes

A conflict warning SHALL apply only to its open change, including private changes the user can already view. It SHALL NOT apply to all branches of a family or all members of a sequence. Merged and abandoned changes SHALL NOT show a conflict warning.

#### Scenario: One family branch conflicts
- **WHEN** a family has a conflicted main change and a mergeable release change
- **THEN** only the main row shows a warning

#### Scenario: One sequence member conflicts
- **WHEN** one open sequence member conflicts while other members are mergeable or closed
- **THEN** only that member shows a warning

### Requirement: Refresh replaces mergeability independently

Each accepted dashboard refresh or current-change read SHALL replace the warning using its new mergeability result, even when the patch-set number and change update time are unchanged. A newer revision or unknown result SHALL NOT inherit a previous revision's conflict warning. Superseded responses SHALL NOT restore obsolete warnings.

#### Scenario: Destination branch changes
- **WHEN** the next dashboard refresh reports different mergeability for the same revision and change update time
- **THEN** the warning reflects the new result

#### Scenario: Next read fails
- **WHEN** a previous read confirmed a conflict but the next accepted read returns unknown mergeability
- **THEN** the old warning is removed without claiming that the change is mergeable

#### Scenario: Old response arrives late
- **WHEN** a newer patch set is accepted before an older mergeability response arrives
- **THEN** the older response does not restore the previous warning

### Requirement: Conflict warnings preserve workflow behavior

Conflict warnings SHALL NOT change review states, sorting, grouping, state colors, tab or tray counts, permissions, or action availability. This capability SHALL NOT add conflict resolution or automatic rebase actions.

#### Scenario: Approved or handed off change conflicts
- **WHEN** an Approved or Ready to Merge change gains a conflict warning
- **THEN** it keeps its existing state, counts, and available actions
