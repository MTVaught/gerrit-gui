# Spec delta

## ADDED Requirements

### Requirement: Saved preferences update all desktop reviews

Successful application and diff preference changes SHALL update all open desktop review windows and the embedded viewer without manual reload or focus change. Updates SHALL retain each review's selected file, comparison, source position where possible, and unsaved text. Windows opened later SHALL use the latest saved values. Invalid edits and failed writes SHALL NOT broadcast a new saved value.

#### Scenario: Change font size in one review
- **WHEN** the user saves Font size 16 in one of two desktop review windows
- **THEN** both reviews use Font size 16 after the automatic update
- **AND** each retains its own selected file, comparison, source position where possible, and unsaved text

#### Scenario: Change application appearance
- **WHEN** the user changes Theme or Diff theme through an existing settings control
- **THEN** open desktop reviews apply the saved theme without closing dialogs or resetting review navigation

#### Scenario: Preference persistence fails
- **WHEN** a preference write fails in one window
- **THEN** that window reports the existing preference error
- **AND** other windows keep the last confirmed value

### Requirement: Concurrent preference edits preserve saved fields

Desktop preference and application-setting writes SHALL merge only the fields being changed with the latest saved state. Concurrent changes to different fields SHALL both survive. For the same field, the last successful write accepted by the app SHALL determine its saved value. Late read results and notifications SHALL NOT restore an older state. A failed write SHALL NOT undo another successful write.

#### Scenario: Edit different fields at once
- **WHEN** one window changes Font size while another changes Ignore Whitespace from the same starting preferences
- **THEN** both successful edits remain saved and appear in both windows

#### Scenario: Edit the same field at once
- **WHEN** two windows save different Font size values
- **THEN** both converge on the last successful value accepted by the app
- **AND** a late response to the earlier write cannot restore its older value

#### Scenario: Keep unrelated application settings
- **WHEN** the board changes the separate-window setting while a review changes Diff theme
- **THEN** both successful changes persist without either replacing the other

### Requirement: Existing desktop diff preferences survive shared storage setup

The first use of shared desktop preference storage SHALL retain valid existing local review preferences and the saved Diff theme. Setup SHALL fill missing or invalid fields with the existing application defaults and SHALL NOT replace already initialized shared values with stale renderer values. Browser-mode persistence and Gerrit account preference isolation SHALL retain their existing behavior.

#### Scenario: Upgrade an existing desktop installation
- **WHEN** an installation with Font size 15 and Show tabs enabled first initializes shared desktop review preferences
- **THEN** those valid values remain active in embedded and separate reviews and after restart
- **AND** the existing saved Diff theme remains in use

#### Scenario: A later renderer has stale local preferences
- **WHEN** shared desktop preferences already exist and another renderer loads older local preferences
- **THEN** the shared values remain authoritative and the stale values do not replace them
