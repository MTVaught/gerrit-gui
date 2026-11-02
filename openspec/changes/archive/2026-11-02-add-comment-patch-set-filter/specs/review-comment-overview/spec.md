# Spec Delta

## ADDED Requirements

### Requirement: Filter overview by patch set

All comments SHALL offer a Patch set filter with All patch sets selected by default and each patch set present in published comments or drafts listed in descending numeric order. Selecting a patch set SHALL show complete threads containing a comment saved on that patch set. The filter SHALL combine with Show and Author without changing the review comparison or drafts.

#### Scenario: Default and available patch sets

- **WHEN** the reviewer opens All comments
- **THEN** All patch sets is selected by default
- **AND** the selector lists distinct patch sets from published comments and drafts in descending numeric order, independent of other filters

#### Scenario: Filter historical comments and replies

- **WHEN** the reviewer selects a patch set
- **THEN** only threads containing a comment whose saved patch set matches are shown
- **AND** each matching thread retains all replies, including replies saved on another patch set
- **AND** mapped display locations do not change which patch sets match

#### Scenario: Combine filters and clear the selection

- **WHEN** the reviewer selects a patch set and a Show or Author filter
- **THEN** each visible thread satisfies every selected filter
- **AND** selecting All patch sets removes only the patch set restriction
- **AND** filtering does not change the selected file, comparison, or draft content

### Requirement: Empty filtered overview

All comments SHALL display a readable message when no threads match the selected filters. The filter controls SHALL remain available in light and dark mode and at narrow window widths.

#### Scenario: No matching threads

- **WHEN** the selected filters match no threads
- **THEN** the list displays No comments match these filters.
- **AND** the reviewer can change any filter to restore matching threads
