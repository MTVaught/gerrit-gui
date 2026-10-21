# review-preferences Specification

## Purpose

Keep review window preferences under application control and apply valid edits automatically without changing Gerrit account diff preferences.

## Requirements

### Requirement: Application-owned review preferences

The application SHALL own Context, Fit to screen, Diff width, Tab width, Font size, Show tabs, Show trailing whitespace, Syntax highlighting, Automatically mark viewed files reviewed, Ignore Whitespace, and Diff theme. Opening a review, opening preferences, or changing these values SHALL NOT read or write Gerrit account diff preferences. Gerrit account preference changes SHALL NOT change application preferences.

#### Scenario: Gerrit settings differ

- **GIVEN** application preferences differ from the user's Gerrit account diff preferences
- **WHEN** the user opens a review and Diff Preferences
- **THEN** the application uses its local preferences
- **AND** no request reads or writes Gerrit account diff preferences

#### Scenario: Edit every preference

- **WHEN** the user changes each supported preference to a valid value
- **THEN** no request reads or writes Gerrit account diff preferences
- **AND** Gerrit's account diff preferences remain unchanged

#### Scenario: Local preferences in a read-only review

- **WHEN** the user changes a valid preference while Gerrit writes are unavailable or the review is read-only
- **THEN** the application applies and persists the preference locally
- **AND** review comments, votes, and reviewed-file writes retain their existing permission checks

### Requirement: Automatic application and dismissal

Each valid preference edit SHALL apply to the current review and start local persistence without a separate submit action. Diff Preferences SHALL stay open after edits, provide Close, omit Save and Cancel, and explain that changes apply automatically in this application. Close and Escape SHALL dismiss the dialog, restore focus to its opener, and retain successful changes.

#### Scenario: Make successive edits

- **WHEN** the user changes Context, Font size, and Ignore Whitespace
- **THEN** each valid edit updates the review without closing Diff Preferences
- **AND** the latest values persist without Save

#### Scenario: Close or press Escape

- **WHEN** the user makes valid edits and dismisses Diff Preferences with Close or Escape
- **THEN** applied changes remain active
- **AND** focus returns to the control that opened Diff Preferences
- **AND** reopening the dialog shows the saved values

#### Scenario: Preserve review work

- **GIVEN** a review has a selected file, comparison, code position, and comment draft
- **WHEN** the user changes a preference
- **THEN** the selected file, comparison, and comment draft remain intact
- **AND** the code position stays on the same source location where the changed layout permits
- **AND** the complete file remains loaded when Context limits visible lines

### Requirement: Validate number edits before application

Diff width SHALL accept integers from 20 through 1000, Tab width from 1 through 16, and Font size from 8 through 32. Empty, fractional, nonnumeric, and out-of-range entries SHALL NOT apply or persist. Invalid entries SHALL have accessible validation feedback. Fit to screen SHALL disable Diff width while retaining its saved value.

#### Scenario: Edit through a temporary invalid value

- **GIVEN** Font size is 13
- **WHEN** the user clears the field or enters an invalid value
- **THEN** the review and saved Font size remain 13
- **AND** the field identifies the invalid entry
- **WHEN** the user enters 16
- **THEN** the review and saved Font size become 16 without a submit action

#### Scenario: Retain a fixed width

- **GIVEN** Diff width is 120
- **WHEN** the user enables Fit to screen
- **THEN** Diff width becomes disabled and retains 120
- **WHEN** the user disables Fit to screen
- **THEN** the review uses the saved width of 120

#### Scenario: Dismiss an invalid entry

- **WHEN** the user dismisses Diff Preferences with an invalid number entry
- **THEN** the last valid applied value remains active and persisted
- **AND** reopening shows that valid value

### Requirement: Preserve local preferences across sessions

Desktop and browser mode SHALL retain valid application preferences across review reopening and application restart or page reload. Existing valid local preferences and the saved Diff theme SHALL remain in use. Missing or invalid fields SHALL use application defaults. The application SHALL NOT import Gerrit preferences or use a previous Gerrit sync marker to select values.

#### Scenario: Preserve an existing installation

- **GIVEN** valid local review preferences, a saved Diff theme, and a legacy Gerrit sync marker exist
- **WHEN** the updated application starts
- **THEN** the application retains the local preferences and saved theme
- **AND** the sync marker has no effect

#### Scenario: Start without valid local preferences

- **WHEN** local preferences are absent, unreadable, or contain invalid fields
- **THEN** the application uses defaults for affected fields without importing Gerrit settings
- **AND** Context defaults to Whole file and Automatically mark viewed files reviewed defaults to off

#### Scenario: Reopen after automatic persistence

- **WHEN** a valid preference edit succeeds and the user opens another review, reloads browser mode, or restarts desktop mode
- **THEN** the application uses the persisted value

### Requirement: Recover from local persistence failures

A failed preference write SHALL produce an accessible error and retain the last confirmed value for the affected preference. Other successful edits SHALL remain applied. The user SHALL be able to change the control again to retry without Save. Rapid edits and late write results SHALL NOT replace a newer successful choice with an older value.

#### Scenario: A local write fails

- **GIVEN** Font size is 13 and a Context edit has succeeded
- **WHEN** the user changes Font size to 16 and local persistence fails
- **THEN** Font size remains 13 and the failure is shown
- **AND** the Context edit remains applied
- **WHEN** the user selects 16 again and local persistence succeeds
- **THEN** Font size becomes 16 and its error clears

#### Scenario: Rapid edits keep the latest choice

- **WHEN** the user makes several valid edits before an earlier asynchronous write finishes
- **THEN** the latest successful value remains active and persisted
- **AND** a late result cannot restore an older choice or discard an edit to another field
