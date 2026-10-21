# Spec delta

## Purpose

Let reviewers resize either side of a diff while each pane uses its available text width and matching source rows stay aligned.

## ADDED Requirements

### Requirement: Independent viewport wrapping

With Fit to screen enabled, each visible diff pane SHALL wrap text to its own available content width. Narrowing one pane SHALL NOT reduce the other pane's wrap width. This behavior SHALL apply in light and dark mode.

#### Scenario: Narrow the original pane

- **GIVEN** both panes show a source line that fits on one visual row
- **WHEN** the reviewer drags the divider left until the original pane must wrap
- **THEN** the original pane wraps the line
- **AND** the wider modified pane keeps that line on one visual row if it fits

#### Scenario: Narrow the modified pane

- **WHEN** the reviewer drags the divider right until the modified pane must wrap
- **THEN** the modified pane wraps to its own content width
- **AND** the wider original pane uses its own content width

#### Scenario: Change the available space

- **WHEN** the review window, file pane, font size, or diff layout changes
- **THEN** each visible diff pane wraps to its resulting content width

### Requirement: Configured column wrapping

With Fit to screen disabled, both panes SHALL wrap at the saved Diff width column. Resizing a pane SHALL preserve that limit. Re-enabling Fit to screen SHALL restore independent viewport wrapping without changing the saved Diff width.

#### Scenario: Toggle the wrapping mode

- **WHEN** the reviewer disables Fit to screen and saves a Diff width of 40
- **THEN** both panes wrap at column 40 even when more width is available
- **WHEN** the reviewer enables Fit to screen again
- **THEN** each pane wraps to its own content width
- **AND** the saved Diff width remains 40

### Requirement: Aligned and usable review navigation

Independent wrapping SHALL preserve alignment of matching source rows, linked vertical scrolling, inline comment anchors, and complete-file navigation. The review SHALL remain usable when resizing and navigating a file with at least 100,000 lines.

#### Scenario: Align unequal visual row counts

- **WHEN** an unchanged source line wraps on only one side
- **THEN** the next matching source line starts at the same vertical position in both panes
- **AND** the wider pane uses blank alignment space as needed

#### Scenario: Navigate a large file after resizing

- **GIVEN** a review has at least 100,000 source lines and unequal pane widths
- **WHEN** the reviewer scrolls and uses complete-file navigation
- **THEN** both panes remain vertically aligned
- **AND** the final source lines remain reachable
- **AND** inline comments remain attached to their source lines
