# Spec delta

## MODIFIED Requirements

### Requirement: Concurrent draft edits do not silently overwrite work

When another in-app window changes, deletes, or publishes a draft being edited locally, the app SHALL preserve unsaved local text and show a conflict. It SHALL stop stale autosave and reject stale explicit saves or deletes. The user SHALL be able to load the saved version or keep local text as a new draft. Separate new drafts SHALL remain distinct even when they use the same source location. Timestamp precision alone SHALL NOT cause a conflict with the editor's own successful save.

#### Scenario: Two windows edit one saved draft
- **WHEN** one window saves a draft after both windows loaded its earlier version
- **THEN** the second window keeps its unsaved text and reports the conflict
- **AND** a late autosave or explicit save from the second cannot overwrite the first window's saved version

#### Scenario: Another window publishes an active draft
- **WHEN** one window publishes or deletes a draft while another edits it
- **THEN** the editing window keeps its text and reports that the draft changed or no longer exists
- **AND** it does not recreate or republish the stale draft automatically

#### Scenario: Receive a refresh after the editor's own autosave
- **GIVEN** Gerrit returns fractional seconds on save and whole seconds when the same draft is read
- **WHEN** the successful autosave causes the editing window to refresh
- **THEN** that window keeps its local text, permits further saves, and shows no conflict
- **AND** this holds for both an embedded review with one dashboard window and a separate review window

#### Scenario: Another edit occurs within the same second
- **GIVEN** two windows loaded the same saved draft
- **WHEN** one window saves different text or resolution within the same stored timestamp second
- **THEN** the other window still reports a conflict and retains its local text
- **AND** its stale update and delete requests are rejected

#### Scenario: Keep conflicting text as a new draft
- **GIVEN** another window has made a real conflicting edit
- **WHEN** the reviewer chooses Keep as new draft
- **THEN** one distinct new draft is created with the retained local text
- **AND** further autosaves update that new draft without a repeated false conflict or extra copies
- **AND** the other window's saved draft remains unchanged

#### Scenario: Load the saved version after a real conflict
- **WHEN** the reviewer chooses Load saved version after another window edits the draft
- **THEN** the editor adopts the saved version and can autosave a later edit to the same draft
- **AND** its own subsequent refresh does not cause another conflict
