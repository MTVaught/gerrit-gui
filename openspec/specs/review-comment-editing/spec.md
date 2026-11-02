# review-comment-editing Specification

## Purpose

Let reviewers enter multiline review comments and save them with a keyboard shortcut while keeping their place in the code.

## Requirements

### Requirement: Enter adds a newline

Comment text fields SHALL insert a newline for Enter and Shift+Enter. This SHALL apply to new comments, replies, and existing draft edits, inline and in fallback composers. These keys SHALL keep the composer open and SHALL NOT trigger explicit save or code-editor commands. Background autosave SHALL retain its existing behavior.

#### Scenario: Enter text on two lines

- **WHEN** a reviewer types a first line, presses Enter, and types a second line in a comment field
- **THEN** the field contains both lines separated by a newline
- **AND** the composer remains open with focus in the comment field

#### Scenario: Use Shift+Enter

- **WHEN** a reviewer presses Shift+Enter in a comment field
- **THEN** the field inserts a newline and the composer remains open

### Requirement: Modifier Enter saves the comment

Cmd+Enter on macOS and Ctrl+Enter on other platforms SHALL invoke the same save action as the Save button. A successful save SHALL retain multiline text and close the composer. The action SHALL retain existing empty-input, pending-write, and save-failure guards. It SHALL NOT run during text composition.

#### Scenario: Save a multiline draft

- **WHEN** a reviewer uses the platform save shortcut in a comment field containing multiline text
- **THEN** the app saves the full text as a private Gerrit draft and closes the composer after success
- **AND** the selected file and comparison remain unchanged

#### Scenario: Save fails

- **WHEN** the save shortcut encounters a save failure
- **THEN** the composer remains open with its text and an error message

#### Scenario: Input composition is active

- **WHEN** the save shortcut arrives while the reviewer is composing text with an input method
- **THEN** the app does not invoke explicit save or close the composer

### Requirement: Inline draft editing preserves review position

Selecting Edit on a visible inline draft SHALL preserve the comment's screen position and the surrounding diff scroll position while opening and focusing its text field. This SHALL apply to single drafts and draft replies in side-by-side and unified layouts, in light and dark mode. Editing SHALL retain the saved draft identity and anchor.

#### Scenario: Edit a single draft

- **WHEN** a reviewer selects Edit on a visible single draft partway down the diff
- **THEN** its text field opens at the same comment position and receives keyboard focus
- **AND** both code panes keep their scroll positions
- **AND** the reviewer can change and save the text on the same draft and anchor

#### Scenario: Edit a draft reply

- **WHEN** a reviewer selects Edit on a visible saved reply in an inline thread
- **THEN** the reply text field opens in that thread without moving the thread or diff scroll position
- **AND** the field receives keyboard focus and retains the reply's saved identity and anchor

#### Scenario: Edit while the anchor is above the viewport

- **GIVEN** a tall thread has its code anchor above the viewport but its draft and Edit button are visible
- **WHEN** a reviewer selects Edit
- **THEN** the visible draft remains at its current position and the diff does not jump back to the anchor
