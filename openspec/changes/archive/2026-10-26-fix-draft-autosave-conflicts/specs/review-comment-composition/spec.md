# Spec delta

## ADDED Requirements

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
