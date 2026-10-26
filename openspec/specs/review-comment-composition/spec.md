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

An overflowing comment text field SHALL support native vertical scrolling with a mouse wheel or trackpad while the pointer is over the field, whether or not it has keyboard focus. This SHALL apply to new comments, replies, and edited drafts in both inline and fallback composers, in light and dark mode.

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

- **WHEN** the reviewer scrolls an overflowing reply or edited draft field
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

### Requirement: Escape cancels the focused comment composer

When focus is within a comment composer, Escape SHALL invoke the same cancellation behavior as its Cancel button and prevent review dismissal. This SHALL apply to inline comments, file comments, and replies. The selected file and comparison SHALL remain active.

#### Scenario: Cancel a new comment

- **WHEN** a reviewer presses Escape within a new comment composer
- **THEN** the composer closes and any draft created by that composer is deleted
- **AND** the review remains open on the same file and comparison

#### Scenario: Cancel an edit to a saved draft

- **WHEN** a reviewer edits a saved draft and presses Escape within its composer
- **THEN** the original draft content, resolution, suggestions, ID, and anchor are restored
- **AND** the composer closes and the review remains open

#### Scenario: Cancel from another composer field

- **WHEN** a reviewer presses Escape in a control within the comment composer
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

### Requirement: Successive draft saves retain one identity

After creating a draft, autosave and explicit Save SHALL update the same saved draft. A refresh of that successful write SHALL preserve current editor text and permit later saves. This SHALL apply to line, file, range, reply, and overall drafts, including edits to stored drafts and typing while creation is pending.

#### Scenario: Continue typing after autosave
- **WHEN** a reviewer types a comment, waits for autosave, edits again, and selects Save
- **THEN** Gerrit stores one draft with the latest text and the same returned ID
- **AND** the app shows no conflict caused by those saves
- **AND** Save closes the composer while the current file and comparison remain selected

#### Scenario: Type while the first save is pending
- **WHEN** a reviewer adds text while a new draft creation is pending
- **THEN** the next save retains the newly returned ID and includes the latest text
- **AND** no duplicate draft is created and local text is not replaced by the earlier response

#### Scenario: Cancel or discard after autosave
- **WHEN** a reviewer cancels a new autosaved draft or discards a saved draft
- **THEN** the app deletes that draft without a false version conflict
- **AND** canceling an edit of an existing draft instead restores its original content, resolution, suggestions, ID, and anchor

### Requirement: Overall summary drafts use valid Gerrit payloads

Overall review summaries SHALL save as private Gerrit drafts at `/PATCHSET_LEVEL` on the selected patch set. Their REST draft payloads SHALL omit `side`, `line`, `range`, and merge-parent position. Source comments and replies SHALL retain their existing saved anchors.

#### Scenario: Autosave a new Reply summary
- **WHEN** a reviewer opens Reply and types an overall summary
- **THEN** the summary autosaves without a patch-set-level position error
- **AND** Send review becomes available after the save succeeds

#### Scenario: Edit and reopen a saved summary
- **WHEN** a reviewer edits an autosaved summary, waits for another save, closes Reply, and reopens it
- **THEN** the dialog restores the latest saved text from one draft with the same ID
- **AND** the summary's own refresh does not pause autosave

#### Scenario: Clear and replace a summary
- **WHEN** a reviewer clears a saved summary and waits for autosave
- **THEN** its saved overall draft is deleted without a false conflict
- **AND** typing replacement text creates one new overall draft without restoring the deleted draft

#### Scenario: Publish or keep a summary private
- **WHEN** a reviewer sends a review with a saved summary
- **THEN** the summary is published once if its patch set is included in the selected publication scope
- **AND** Keep drafts private leaves it saved privately with its ID and text unchanged
- **AND** a successfully published summary has no remaining private copy

#### Scenario: Preserve source comment coordinates
- **WHEN** a reviewer saves a source comment or reply with a side, line, range, or merge-parent selection
- **THEN** its saved source coordinates and original patch set are preserved
- **AND** the overall-summary payload rule does not relocate that comment or reply

### Requirement: Draft failures retain text for retry

A failed draft write SHALL retain local text and offer retry. Only a real saved-version conflict SHALL activate conflict recovery. A failed write or a successful write's refresh SHALL NOT silently create a replacement draft.

#### Scenario: Retry a failed update
- **GIVEN** a draft already has a saved ID
- **WHEN** an update fails and the reviewer retries it
- **THEN** the retry updates that ID with the retained local text
- **AND** no extra draft is created and ordinary save failures are not reported as concurrent edits
