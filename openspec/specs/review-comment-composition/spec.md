# review-comment-composition Specification

## Purpose

Let reviewers write and edit comments with clear controls while preserving data already stored in Gerrit drafts.

## Requirements

### Requirement: Comment entry omits replacement controls

The review comment editor SHALL omit controls to add, edit, or remove suggested replacements. It SHALL retain comment text, formatting preview, resolution, autosave, Save, and Cancel in both light and dark mode.

#### Scenario: Comment on a selected revision range

- **WHEN** a reviewer opens a comment editor for a selected revision range
- **THEN** the editor shows the ordinary comment controls without a replacement button, fix description, replacement field, or remove-suggestion action
- **AND** autosave and Save retain the selected range and message

#### Scenario: Edit a stored draft

- **WHEN** a reviewer opens a stored draft containing suggested replacements
- **THEN** the editor shows the same ordinary comment controls without suggestion fields

### Requirement: Existing suggestions survive comment edits

Editing text or resolution and canceling changes SHALL preserve suggested replacements already stored in a draft. Published comments SHALL retain suggestion display, preview, and apply controls.

#### Scenario: Save an existing suggestion draft

- **WHEN** a reviewer changes the text or resolution of a draft with stored suggestions
- **THEN** saves retain the draft ID, anchor, and suggestion data

#### Scenario: Cancel a saved draft edit

- **WHEN** a reviewer changes a stored draft and selects Cancel after autosave
- **THEN** the app restores the original text, resolution, and suggestion data

#### Scenario: Read and apply an existing suggestion

- **WHEN** a reviewer opens a published comment with a suggested replacement
- **THEN** its replacement content, preview, and apply workflow remain available

### Requirement: Comment text fields scroll internally

An overflowing comment text field SHALL support native vertical scrolling with a mouse wheel or trackpad while the pointer is over the field, whether or not it has keyboard focus. This SHALL apply to new comments, replies, edited drafts, and suggested-replacement text fields in both inline and fallback composers, in light and dark mode.

#### Scenario: Scroll a long comment in either direction

- **GIVEN** a comment contains more lines than its field can display
- **WHEN** the reviewer scrolls down and then up over that field
- **THEN** the visible text moves in the requested direction and the first and last lines remain reachable
- **AND** the field retains its dimensions and full text

#### Scenario: Scroll without changing focus

- **GIVEN** keyboard focus is outside an overflowing comment field
- **WHEN** the reviewer moves the pointer over that field and scrolls
- **THEN** its text scrolls without taking keyboard focus

#### Scenario: Use the shared composer fields

- **WHEN** the reviewer scrolls an overflowing reply, edited draft, or suggested-replacement field
- **THEN** that field scrolls its own text
- **AND** other fields retain their scroll position

### Requirement: Comment scrolling preserves the surrounding review position

While the pointer is over an overflowing comment field, vertical wheel and trackpad gestures SHALL leave the surrounding diff or dialog position unchanged, including at the field's top and bottom boundaries. Scrolling over code or non-overflowing comment fields SHALL retain the existing outer-scroll behavior. These rules SHALL apply in side-by-side and unified layouts.

#### Scenario: Scroll within an inline comment

- **WHEN** the reviewer scrolls an overflowing inline field on either side of a side-by-side diff or in a unified diff
- **THEN** both code panes retain their scroll positions
- **AND** the selected file, patch-set comparison, and comment anchor remain unchanged

#### Scenario: Continue at a text boundary

- **GIVEN** an overflowing field is at its top or bottom
- **WHEN** the reviewer continues scrolling toward that boundary while the pointer remains over the field
- **THEN** the field stays at the boundary and the surrounding review does not scroll

#### Scenario: Scroll outside an overflowing field

- **WHEN** the reviewer scrolls over code, comment controls, or a field whose text fits without vertical overflow
- **THEN** the existing surrounding-scroll behavior remains available

#### Scenario: Scroll a fallback composer

- **GIVEN** a comment composer is displayed outside the diff
- **WHEN** the reviewer scrolls its overflowing text field, including at a boundary
- **THEN** the field scrolls internally and the surrounding dialog remains at its current position

### Requirement: Scrolling preserves text editing and draft operations

Internal scrolling SHALL preserve native keyboard navigation, selection, scrollbar use, vertical resize, focus, and draft operations. Scrolling alone SHALL NOT change the message, resolution state, saved identity, anchor, or initiate a draft write. Resizing SHALL update which field owns scrolling based on its resulting overflow.

#### Scenario: Navigate and edit after scrolling

- **WHEN** the reviewer scrolls a long comment, selects text, uses keyboard navigation to reach hidden lines, and edits the message
- **THEN** the caret and selection behave as a native text field
- **AND** autosave and Save retain the complete edited message and existing draft identity

#### Scenario: Scroll without editing

- **GIVEN** a draft has no pending edit
- **WHEN** the reviewer only scrolls within its text field
- **THEN** no draft write occurs and the draft state remains unchanged

#### Scenario: Resize or cancel an edit

- **WHEN** the reviewer resizes the text field, then scrolls it or its native scrollbar
- **THEN** scrolling uses the resulting field dimensions without a code-position jump
- **AND** Cancel retains its existing restore or discard behavior
