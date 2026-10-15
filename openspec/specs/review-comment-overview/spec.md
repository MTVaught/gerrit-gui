# review-comment-overview Specification

## Purpose

Give reviewers a readable overview of comment threads and clear ways to return to the code without losing their review position.

## Requirements

### Requirement: Wide comment overview

The All comments dialog SHALL occupy about 90% of the review window width, retain a visible background margin, and fit within the window in light and dark mode.

#### Scenario: Open the overview

- **WHEN** a reviewer opens All comments in either theme
- **THEN** the dialog uses about 90% of the review window width
- **AND** a visible background margin surrounds it
- **AND** the dialog content fits within the window without horizontal page overflow

### Requirement: Persistent overview controls

The dialog SHALL keep its All comments title, filters, and Back to review button with an Esc hint visible while the thread list scrolls.

#### Scenario: Read a long list

- **WHEN** the reviewer scrolls an overflowing comment list
- **THEN** only the thread list scrolls
- **AND** the title, filters, Back to review button, and Esc hint remain visible

### Requirement: Explicit and keyboard dismissal

The reviewer SHALL be able to dismiss All comments with Back to review or Escape. Either action SHALL close only the overview and keep the review open.

#### Scenario: Return button

- **WHEN** the reviewer activates Back to review
- **THEN** the overview closes and the review remains open

#### Scenario: Escape key

- **WHEN** the reviewer presses Escape while the overview is active
- **THEN** the overview closes and the review remains open

### Requirement: Background dismissal

A click on the dimmed background outside All comments SHALL close the overview without activating the underlying review. A click inside the dialog SHALL NOT dismiss it unless it activates an action that leaves the overview. A pointer gesture that starts inside and ends outside SHALL NOT dismiss it.

#### Scenario: Click outside

- **WHEN** the reviewer clicks the dimmed area outside the overview
- **THEN** the overview closes
- **AND** the underlying review receives no action from that click

#### Scenario: Use controls inside

- **WHEN** the reviewer clicks a filter or comment content within the dialog
- **THEN** the overview remains open
- **AND** the selected control keeps its normal behavior

#### Scenario: Drag from the list

- **WHEN** a pointer gesture starts inside the overview and ends on the background
- **THEN** the overview remains open

### Requirement: Review continuity

Dismissal SHALL preserve the selected file, patch-set comparison, code scroll position, and draft state. Focus SHALL return to the Comments menu control that opened the overview. Selecting a comment location SHALL close the overview and navigate to that location as before.

#### Scenario: Dismiss without navigation

- **WHEN** the reviewer dismisses the overview with the return button, Escape, or background click
- **THEN** the selected file, comparison, code position, and drafts remain unchanged
- **AND** focus returns to the Comments menu control

#### Scenario: Navigate from a thread

- **WHEN** the reviewer selects a comment location
- **THEN** the overview closes and the review reveals that location
- **AND** cross-file replies and draft editing retain their existing behavior

### Requirement: Other review dialogs retain their behavior

The new overview layout and background dismissal SHALL NOT change publishing, draft composition, deletion confirmation, suggested-fix preview, outline, or blame dialogs.

#### Scenario: Use another review dialog

- **WHEN** a reviewer opens a review dialog other than All comments
- **THEN** its existing size, dismissal rules, and draft protection remain unchanged
