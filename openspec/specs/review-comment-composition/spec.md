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
