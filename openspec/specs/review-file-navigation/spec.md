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

### Requirement: Reset reviewed files from the file list

The review file list SHALL provide a keyboard-accessible reset glyph button in the Files heading beside the reviewed count, named "Mark all unreviewed" through its accessible label and tooltip. One activation SHALL clear the signed-in user's reviewed flags for the selected target patch set, including hidden files and files outside the selected comparison. It SHALL preserve other patch sets, other users, comments, drafts, votes, file selection, comparison, and filter setting.

#### Scenario: Reset a partly reviewed patch set
- **WHEN** the user activates the button with two of four files reviewed
- **THEN** all four files are unreviewed and the count shows zero reviewed
- **AND** the same file and comparison remain selected

#### Scenario: Reset while filtered
- **WHEN** the user activates the button with "Unreviewed only" enabled
- **THEN** reviewed files hidden by that filter become unreviewed and appear in the list
- **AND** the filter remains enabled

#### Scenario: Reset from a patch-set comparison
- **WHEN** the target patch set has reviewed files outside the current comparison and the user activates the button
- **THEN** those files also become unreviewed for the target patch set
- **AND** reviewed flags for the base patch set and other users remain unchanged

#### Scenario: Activate from the keyboard
- **WHEN** the user focuses the button and presses Enter or Space
- **THEN** the same reset runs as with a pointer click

### Requirement: Show reset availability and pending state

The button SHALL remain visible and disabled while reviewed status is unavailable, no reviewed files remain, review writes are blocked, or a reviewed-file write is pending. During a reset it SHALL show a distinct busy glyph with the accessible name and tooltip "Marking all unreviewed..." and prevent duplicate resets, competing reviewed-file actions, comparison changes, and review closure until pending work finishes.

#### Scenario: Status unavailable or already clear
- **WHEN** reviewed status is loading, failed to load, or contains no reviewed paths
- **THEN** the button is disabled and starts no writes

#### Scenario: Reset is pending
- **WHEN** a reset is waiting on server responses
- **THEN** its busy glyph is visible, its accessible name and tooltip describe pending work, and a second activation starts no writes
- **AND** per-file controls, reviewed shortcuts, automatic marking, comparison changes, and review closure cannot interrupt the reset

#### Scenario: Writes blocked
- **WHEN** the review connection or permissions block writes
- **THEN** the reset cannot run and existing permission checks still apply

### Requirement: Preserve confirmed progress on reset failure

A reset SHALL update flags only after confirmed writes. If a write fails, it SHALL stop further reset writes, report the failure visibly, and keep successful clears. After reloading reviewed status, the user SHALL be able to retry remaining reviewed files. Confirmed results SHALL reach other open views through the existing refresh behavior. A late response SHALL NOT change another review context.

#### Scenario: Partial failure and retry
- **WHEN** one file clears successfully and the next file fails
- **THEN** the first file remains unreviewed and the error does not claim full success
- **AND** refreshing status and activating the button again clears only remaining reviewed files

#### Scenario: First write fails
- **WHEN** the first reset write fails
- **THEN** no file appears successfully cleared and the review shows an error

#### Scenario: Another view is open
- **WHEN** a reset clears files while another view shows the same change and target patch set
- **THEN** that view refreshes confirmed flags without losing its local selection or unsaved text

#### Scenario: Connection changes during reset
- **WHEN** the connection changes before all reset requests finish
- **THEN** no further writes use the old review context and late results do not populate the new context

### Requirement: Keep the current visit unreviewed after reset

When automatic marking is enabled, a reset SHALL leave the current file unreviewed for its current visit. It SHALL NOT change the saved automatic-marking preference. Opening another file or revisiting the current file SHALL resume normal automatic marking.

#### Scenario: Reset while automatic marking is enabled
- **WHEN** the user resets reviewed flags while viewing a loaded file with automatic marking enabled
- **THEN** that file remains unreviewed after the reset and its resulting status refreshes
- **AND** opening another file resumes automatic marking
