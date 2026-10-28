# reviewed-files Specification

## Purpose

Let reviewers change per-file reviewed flags without lost input or status flashes while Gerrit saves and refreshes the review.

## Requirements

### Requirement: Independent file flag changes

The review SHALL show a requested file flag and its progress count immediately. Saving one file SHALL leave other loaded file flags available for input. A file with a pending write SHALL prevent duplicate writes to that file. The sidebar, current-file checkbox, keyboard actions, and Unreviewed only filter SHALL use the same flag state.

#### Scenario: Change several files during a slow save
- **GIVEN** five files are reviewed
- **WHEN** the reviewer clicks three different checkmarks before the first save finishes
- **THEN** all three files immediately show unreviewed and each change is saved
- **AND** the two other files remain reviewed

#### Scenario: Repeat an action on a pending file
- **WHEN** a file flag is saving and another action targets the same file
- **THEN** the app does not send a duplicate write for that file
- **AND** unrelated file controls remain available

### Requirement: Stable reviewed status during refresh

Refreshing a loaded patch set SHALL keep its known file flags and progress visible. A response started before a local flag change or superseded by another read SHALL NOT replace newer flags. The app SHALL reconcile saved flags after pending local writes settle and SHALL still accept confirmed changes from other review windows.

#### Scenario: Refresh after a successful flag save
- **WHEN** the automatic reviewed-list read waits on Gerrit
- **THEN** known checkmarks and the progress count stay visible without a Loading status transition

#### Scenario: A stale read finishes after a write
- **WHEN** a reviewed-list read starts before a local flag change and finishes after that change
- **THEN** it cannot restore the old flag or erase another local change

#### Scenario: Another window saves a flag
- **WHEN** another in-app window saves a reviewed flag on the same patch set
- **THEN** this view reflects the confirmed change after refresh without clearing its known status list

### Requirement: Failed flag saves remain recoverable

A failed save SHALL restore only the affected file's confirmed flag, preserve other changes, and show an error that identifies the file. The reviewer SHALL be able to retry. Background refreshes and successful writes to other files SHALL NOT silently clear the save error. A failed refresh SHALL retain known flags and offer retry.

#### Scenario: One of several writes fails
- **WHEN** one file save fails while other file saves succeed
- **THEN** only the failed file returns to its prior flag
- **AND** the error stays visible until the reviewer retries that file or explicitly reloads status

#### Scenario: The status refresh fails
- **WHEN** a refresh of known flags fails
- **THEN** the known flags stay visible and the app shows the read error with retry

### Requirement: Flag state stays within its revision

The review SHALL scope flags, pending saves, and errors to their change and target patch set. Late results from a previous selection SHALL NOT alter the selected patch set's flags. Pending writes SHALL continue to block review closure until they settle.

#### Scenario: Select another patch set while saving
- **WHEN** the reviewer selects a different patch set before a flag save finishes
- **THEN** the save changes only its original patch set
- **AND** the selected patch set shows its own flags
