# Spec delta

## ADDED Requirements

### Requirement: Toggle the original diff pane

Shift+A SHALL hide or restore the original pane of a side-by-side review in embedded and separate windows. The modified pane SHALL use the available diff width while the original is hidden. The file list, selected file, comparison, review data, and saved divider ratio SHALL remain intact. The toggle SHALL persist across files within the review and appear in shortcut help.

#### Scenario: Hide and restore

- **WHEN** the reviewer presses Shift+A in a side-by-side diff
- **THEN** the original pane and its header disappear and the modified pane expands
- **AND** focus moves from the original editor to the modified editor if needed
- **WHEN** the reviewer presses Shift+A again
- **THEN** both panes return with the prior divider ratio

#### Scenario: Navigate while hidden

- **WHEN** the reviewer opens another file while the original pane is hidden
- **THEN** the new file also shows only the modified pane
- **AND** restoring the original pane retains the shared divider ratio

#### Scenario: Preserve other diff navigation

- **WHEN** the reviewer selects the original pane with Shift+Left or reveals an original-side comment
- **THEN** the original pane becomes visible before focus moves there
- **WHEN** the reviewer changes diff mode with M
- **THEN** normal unified or side-by-side rendering resumes
- **AND** Shift+A leaves a unified diff unchanged

### Requirement: Guard the pane shortcut during text entry

Shift+A SHALL follow existing review shortcut guards for text fields, editor widgets, dialogs, IME, extra modifiers, and repeated key events. Plain A SHALL retain its review-dialog action.

#### Scenario: Type uppercase A

- **WHEN** the reviewer types Shift+A in a comment, search field, or other text entry
- **THEN** the pane visibility remains unchanged

#### Scenario: Extra modifiers and repeats

- **WHEN** Shift+A arrives with Ctrl, Cmd, Alt, IME composition, or key repeat
- **THEN** the pane visibility remains unchanged
