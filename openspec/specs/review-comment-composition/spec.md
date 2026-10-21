# review-comment-composition Specification

## Purpose

Let reviewers cancel comment composition with the keyboard while preserving the active review and the existing draft lifecycle.

## Requirements

### Requirement: Escape cancels the focused comment composer

When focus is within a comment composer, Escape SHALL invoke the same cancellation behavior as its Cancel button and prevent review dismissal. This SHALL apply to inline comments, file comments, replies, and suggested-fix fields. The selected file and comparison SHALL remain active.

#### Scenario: Cancel a new comment

- **WHEN** a reviewer presses Escape within a new comment composer
- **THEN** the composer closes and any draft created by that composer is deleted
- **AND** the review remains open on the same file and comparison

#### Scenario: Cancel an edit to a saved draft

- **WHEN** a reviewer edits a saved draft and presses Escape within its composer
- **THEN** the original draft content, resolution, suggestions, ID, and anchor are restored
- **AND** the composer closes and the review remains open

#### Scenario: Cancel from another composer field

- **WHEN** a reviewer presses Escape in a suggested replacement or another control within the comment composer
- **THEN** the same Cancel action runs and the review remains open

### Requirement: Escape respects pending draft writes

While Cancel is disabled during a draft write, Escape within the composer SHALL be consumed without closing the composer or the review. After the write finishes, Escape SHALL use the normal Cancel action.

#### Scenario: Press Escape during autosave

- **WHEN** a reviewer presses Escape within the composer while autosave is pending
- **THEN** the composer and review remain open
- **AND** pressing Escape after the write completes cancels the comment

### Requirement: Escape outside comment composition keeps existing behavior

Escape outside a comment composer SHALL keep its existing dismissal behavior, including closing the review when no nested dialog or editor widget handles the key.

#### Scenario: Return to the dashboard

- **WHEN** the reviewer presses Escape in the review with no active composer or nested dialog
- **THEN** the review closes as before
