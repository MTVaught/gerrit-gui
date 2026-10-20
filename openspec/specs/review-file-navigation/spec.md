# review-file-navigation Specification

## Purpose

Let reviewers read changed file names and folder paths and adjust the file navigation pane without losing access to the diff.

## Requirements

### Requirement: Content-based default width

Each newly opened review SHALL size its file pane to fit the visible file rows and folder paths, up to half of the review body's width. File rows SHALL include space for review controls and line counts. Automatic sizing SHALL adapt when visible content or window width changes.

#### Scenario: A name exceeds the former width limit
- **WHEN** a review opens with a file name or folder path that needs more than 360 px but fits within half of the review body
- **THEN** the pane shows that text in full on one line without manual resizing

#### Scenario: Review opens again
- **WHEN** the user closes a review after manually resizing its pane and opens a review again
- **THEN** the pane starts with content-based automatic sizing

### Requirement: Full labels in limited space

The file pane SHALL wrap folder paths and file names that exceed its available width, including text with no spaces. It SHALL show the complete text without ellipses or horizontal scrolling. The pane SHALL use at most half of the review body's width, including after window resizing, so the diff remains accessible.

#### Scenario: Name exceeds the available width
- **WHEN** a folder path or file name exceeds half of the review body
- **THEN** its full text wraps inside the pane and its row grows to contain it
- **AND** file controls and line counts remain visible

#### Scenario: Window becomes narrower
- **WHEN** the review window becomes narrower in automatic or manual sizing mode
- **THEN** the file pane stays within half of the review body and labels wrap within its new width

### Requirement: Accessible manual resizing

The user SHALL be able to resize the file pane with its pointer separator and Left and Right arrow keys. The maximum width SHALL track half of the review body rather than a fixed 360 px limit. The separator SHALL report its current width and valid range to assistive technology. Manual sizing SHALL last for the current review session.

#### Scenario: Expand past the former limit
- **WHEN** the user drags the separator or presses Right with enough review space
- **THEN** the pane can expand beyond 360 px up to half of the review body

#### Scenario: Resize a wrapped row
- **WHEN** the user narrows the pane with the separator
- **THEN** full file and folder labels remain readable through wrapping
