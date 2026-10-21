# Spec Delta

## Purpose

Keep new review comments attached to the source text the reviewer selected, including selections that end just after a line break.

## ADDED Requirements

### Requirement: Exclude a trailing line break from a new comment range

When a nonempty code selection ends at the start of a later source line, the app SHALL end the new comment range at the end of the previous source line and attach the comment to that line. The start position SHALL remain unchanged. Forward and reverse selections SHALL give the same result.

#### Scenario: Select one complete line with its newline

- **GIVEN** source line 1 contains 27 characters
- **WHEN** the reviewer selects from line 1, character 0 through line 2, character 0 and adds a comment
- **THEN** the composer appears directly below line 1
- **AND** the new comment has line 1 and range from line 1, character 0 through line 1, character 27

#### Scenario: Select several lines with a final newline

- **WHEN** a reviewer selects part of line 4 through the start of line 7 and adds a comment
- **THEN** the comment attaches to line 6 and its range ends at line 6's source-text length
- **AND** the range keeps its selected starting character on line 4

#### Scenario: Select in reverse

- **WHEN** the reviewer selects the same text from the start of line 7 back into line 4
- **THEN** the new comment uses the same line and range as the forward selection

#### Scenario: The last selected source line is blank

- **GIVEN** line 6 is blank
- **WHEN** a selection starts on line 4 and ends at the start of line 7
- **THEN** the comment attaches to line 6 and its range ends at line 6, character 0
- **AND** earlier selected blank lines and whitespace remain in the range

### Requirement: Preserve ordinary source selections

A caret without selected text SHALL create a line comment. A selection that ends inside a line SHALL keep its source coordinates. New comment ranges SHALL use source-text columns and line numbers even when the display wraps or contains tabs, Unicode text, or CRLF line endings.

#### Scenario: Comment without a range

- **WHEN** the reviewer adds a comment with a caret on line 3 and no selected text
- **THEN** the comment attaches to line 3 without a range

#### Scenario: End within the next line

- **WHEN** a selected range ends at character 2 of line 7
- **THEN** the comment attaches to line 7 and retains that selected range

#### Scenario: Comment on a wrapped source line

- **WHEN** a selected source line wraps across several display rows and the selection includes its trailing newline
- **THEN** the comment attaches to that source line and ends at its source-text length

#### Scenario: Preserve source columns

- **WHEN** the last selected line contains tabs or Unicode text, or the file uses CRLF line endings
- **THEN** the adjusted endpoint uses the editor's source character coordinates, without counting display columns or line-ending characters

### Requirement: Represent a newline-only selection as a line comment

If removing the final line break leaves an empty range, the app SHALL create a line comment on the source line before that break, without an empty or reversed range.

#### Scenario: Select only a newline

- **WHEN** the reviewer selects from the end of line 4 to the start of line 5 and adds a comment
- **THEN** the comment attaches to line 4 without a range

#### Scenario: Select the newline of a blank line

- **GIVEN** line 4 is empty
- **WHEN** the reviewer selects from the start of line 4 to the start of line 5
- **THEN** the comment attaches to line 4 without a range

### Requirement: Use consistent comment anchors throughout creation and storage

The comment shortcut and editor context menu SHALL produce the same new comment anchor on either diff side in split and unified layouts. Autosave, Save, and reopening SHALL retain the resulting line and range, selected file, patch set, and side. Existing comments, reply anchors, saved drafts, and supplied replacement ranges SHALL retain their stored coordinates.

#### Scenario: Use either entry point on either side

- **WHEN** the reviewer adds a comment for the same selected text through the shortcut or editor context menu on an available original or modified source pane
- **THEN** the resulting line and range match in split and unified layouts
- **AND** the file, patch set, and side follow the selected source pane

#### Scenario: Save and reopen a normalized comment

- **WHEN** a comment created from a selection with a trailing newline is autosaved, saved, and reopened
- **THEN** the saved request and restored composer use the adjusted line and range
- **AND** the comment remains directly below its last selected source line

#### Scenario: Work with an existing comment

- **WHEN** the reviewer opens, edits, or replies to a stored comment with a range ending at the start of a later line
- **THEN** the app retains that comment's stored anchor and any supplied replacement range
- **AND** selection normalization does not rewrite existing data
