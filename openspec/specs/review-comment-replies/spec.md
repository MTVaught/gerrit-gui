# review-comment-replies Specification

## Purpose

Keep replies in their original Gerrit comment threads while allowing reviewers to read and respond from a newer patch-set comparison.

## Requirements

### Requirement: Replies retain their parent comment anchor

The built-in review tool SHALL save a new reply with the parent comment's original patch set, path, side, merge parent, line, and range, and SHALL set `in_reply_to` to that parent's ID. A mapped display position SHALL NOT replace the saved anchor. This rule SHALL apply to Reply, Quote, Ack, and Done.

#### Scenario: Reply to an older comment from a newer patch set

- **GIVEN** a comment on patch set 2 at line 1 is mapped to line 2 on patch set 3
- **WHEN** the reviewer saves a reply while viewing patch set 3
- **THEN** Gerrit receives a reply draft on patch set 2 at line 1 with the original comment's ID as `in_reply_to`

#### Scenario: Reply to a renamed file or selected range

- **GIVEN** a parent comment has an original file path and range that differ from its mapped display location
- **WHEN** the reviewer creates a reply
- **THEN** the saved reply retains the original file path, line, and complete range

#### Scenario: Reply to a parent-side comment

- **WHEN** the reviewer responds to a comment on a patch set's parent side, including a specified merge parent
- **THEN** the reply retains that patch set, side, and merge-parent selection

#### Scenario: Use another thread response action

- **WHEN** the reviewer uses Quote, Ack, or Done on a mapped older thread
- **THEN** the saved draft uses the same original-anchor rule as Reply
- **AND** Quote retains its quoted text and Ack and Done retain their existing text and resolved state

#### Scenario: Reply to the latest comment in a chain

- **WHEN** the reviewer responds to a thread with several published comments
- **THEN** the reply uses the latest published comment's ID and original anchor

### Requirement: Mapped reply editing preserves review context

When Gerrit supplies a mapping for an older thread, the reply composer and its saved draft SHALL remain at that mapped thread location in the active comparison. Mapping SHALL affect display only. Reply composition, autosave, and Save SHALL preserve the selected file and comparison.

#### Scenario: Start and save a reply at the mapped location

- **GIVEN** an older thread is displayed inline on the current file
- **WHEN** the reviewer opens Reply, types, waits for autosave, and clicks Save
- **THEN** the composer and saved draft remain in that thread at its mapped location
- **AND** the app does not change the selected file or patch-set comparison
- **AND** the request retains the original anchor even before a mapping for the new draft ID is available

#### Scenario: Open a reply from All comments for another file

- **WHEN** a reviewer selects Reply on an older thread in another file through All comments
- **THEN** the overview closes and the app opens that file's mapped thread in the active comparison
- **AND** the composer saves the reply using the original anchor

#### Scenario: No mapping is available

- **GIVEN** Gerrit supplies no mapping for the older thread in the active comparison
- **WHEN** a reviewer opens a reply
- **THEN** the app uses its existing original-location navigation or fallback composer behavior
- **AND** the saved reply still uses the original anchor

### Requirement: Reply draft updates retain identity and coordinates

Autosave, Save, resolution changes, editing, Cancel, and discard SHALL operate on the reply draft's saved ID and original anchor. Further saves SHALL update the same draft. Cancel SHALL delete a newly created reply draft or restore an existing draft's saved state, as applicable. The app SHALL NOT relocate existing drafts as part of this fix.

#### Scenario: Continue typing during autosave

- **WHEN** a reviewer continues typing while a new reply draft is being created
- **THEN** later saves update the returned draft ID with the latest text and the same original anchor
- **AND** only one draft remains

#### Scenario: Edit and cancel an older saved reply

- **WHEN** a reviewer edits a saved reply at its mapped location and then selects Cancel
- **THEN** the original text, resolution state, ID, and saved anchor are restored

#### Scenario: Cancel or discard a new reply

- **WHEN** a reviewer cancels an autosaved new reply or discards its saved draft
- **THEN** the app deletes that draft from its original patch set
- **AND** the published parent comment remains unchanged

### Requirement: Reply publication preserves scope and thread membership

Publishing all drafts SHALL include replies saved on older patch sets. Publishing only the selected patch set SHALL exclude replies saved on other patch sets, and Keep drafts private SHALL publish none. On Gerrit 3.11.2, a newly created and published reply SHALL appear once within the original thread in the web diff, with one stored reply ID.

#### Scenario: Publish an older reply from the current patch set

- **GIVEN** a reply draft belongs to patch set 2 and the reviewer is viewing patch set 3
- **WHEN** the reviewer publishes all drafts
- **THEN** Gerrit stores one published reply with the original parent ID and patch-set-2 anchor
- **AND** Gerrit's patch-set-3 web diff displays that reply once in the ported original thread
- **AND** no copy of the reply remains as a private draft

#### Scenario: Limit publication to the selected patch set

- **GIVEN** a reply draft belongs to patch set 2 and the reviewer is viewing patch set 3
- **WHEN** the reviewer chooses to publish only drafts on the selected patch set
- **THEN** the reply is excluded from the published draft list and remains private on patch set 2

#### Scenario: Keep the reply private

- **WHEN** the reviewer sends a review with Keep drafts private selected
- **THEN** the reply remains a private draft with its saved ID and anchor

#### Scenario: Reply on the selected patch set

- **WHEN** the parent comment already belongs to the selected patch set
- **THEN** the reply retains that anchor and its normal publication behavior
