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

### Requirement: Collapsed comments render Markdown

Collapsed inline comments and comments in All comments SHALL render their message as Markdown in light and dark mode. Bold text, inline code, and links SHALL remain readable. Headings, lists, code blocks, and explicit line breaks SHALL fit in the existing single-line preview without increasing the collapsed row height.

#### Scenario: Scan a collapsed comment

- **WHEN** a reviewer reads a collapsed comment with bold text, inline code, a link, and a quotation in either comment view
- **THEN** the preview shows formatted content instead of Markdown delimiters
- **AND** the preview stays on one line

#### Scenario: Collapse block content

- **WHEN** a reviewer collapses a comment containing headings, lists, code blocks, or explicit line breaks
- **THEN** the content stays in one preview line with separation between words
- **AND** expanding the comment restores its normal block formatting and line breaks

### Requirement: Collapsed preview links preserve comment state

Activating an HTTP or HTTPS link in a collapsed preview SHALL use the existing external-link action without expanding the comment. Activating preview text or its toggle SHALL retain normal expansion and collapse behavior. Existing restrictions on links and images SHALL remain in effect.

#### Scenario: Open a preview link

- **WHEN** the reviewer activates a link in a collapsed preview
- **THEN** the app sends the link to its external-link action
- **AND** the comment stays collapsed

#### Scenario: Expand formatted preview text

- **WHEN** the reviewer activates formatted preview text or the expansion toggle
- **THEN** the full comment opens with its normal Markdown rendering
- **AND** collapsing it restores the formatted preview

### Requirement: Filter overview by patch set

All comments SHALL offer a Patch set filter with All patch sets selected by default and each patch set present in published comments or drafts listed in descending numeric order. Selecting a patch set SHALL show complete threads containing a comment saved on that patch set. The filter SHALL combine with Show and Author without changing the review comparison or drafts.

#### Scenario: Default and available patch sets

- **WHEN** the reviewer opens All comments
- **THEN** All patch sets is selected by default
- **AND** the selector lists distinct patch sets from published comments and drafts in descending numeric order, independent of other filters

#### Scenario: Filter historical comments and replies

- **WHEN** the reviewer selects a patch set
- **THEN** only threads containing a comment whose saved patch set matches are shown
- **AND** each matching thread retains all replies, including replies saved on another patch set
- **AND** mapped display locations do not change which patch sets match

#### Scenario: Combine filters and clear the selection

- **WHEN** the reviewer selects a patch set and a Show or Author filter
- **THEN** each visible thread satisfies every selected filter
- **AND** selecting All patch sets removes only the patch set restriction
- **AND** filtering does not change the selected file, comparison, or draft content

### Requirement: Empty filtered overview

All comments SHALL display a readable message when no threads match the selected filters. The filter controls SHALL remain available in light and dark mode and at narrow window widths.

#### Scenario: No matching threads

- **WHEN** the selected filters match no threads
- **THEN** the list displays No comments match these filters.
- **AND** the reviewer can change any filter to restore matching threads
