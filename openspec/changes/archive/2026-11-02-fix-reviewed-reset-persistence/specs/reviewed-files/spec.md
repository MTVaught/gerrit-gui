# Spec delta

## ADDED Requirements

### Requirement: Explicit unreviewed state persists

Explicitly clearing reviewed files SHALL remain saved after status refresh and reopening the review, even when Gerrit can inherit flags from an older patch set. This SHALL apply to both the bulk reset and clearing the last individual reviewed file. It SHALL preserve other patch sets and other users. The reviewer SHALL still be able to mark files reviewed again.

#### Scenario: Reset inherited flags
- **GIVEN** unchanged files have reviewed flags on an older patch set
- **WHEN** the reviewer marks all files unreviewed on the selected target patch set
- **THEN** the next status read keeps those files unreviewed
- **AND** the older patch set and another user's flags remain unchanged

#### Scenario: Reopen after reset
- **WHEN** the reviewer closes and reopens a review after a successful reset
- **THEN** the saved reviewed count is zero and every file is unreviewed

#### Scenario: Clear the last individual flag
- **WHEN** the reviewer marks the last reviewed file unreviewed
- **THEN** subsequent reads do not restore flags from older patch sets

#### Scenario: Mark a file again
- **WHEN** the reviewer marks a file reviewed after a saved reset
- **THEN** only that file becomes reviewed
- **AND** clearing it again leaves the saved reviewed list empty

### Requirement: Persistence metadata is hidden from file status

Internal metadata used to preserve empty review state SHALL NOT appear as a reviewed file, affect the reviewed count or filter, or become a bulk reset target.

#### Scenario: Only internal metadata remains
- **WHEN** the server retains only internal empty-state metadata for a patch set
- **THEN** the app reports no reviewed files and disables the empty reset action
- **AND** the Unreviewed only filter shows every file

### Requirement: Failed empty-state persistence preserves file flags

If the app cannot save the state needed to prevent inherited flags from returning, it SHALL stop before deleting the affected file's reviewed flag and report the save error through the existing retry controls.

#### Scenario: Saving empty-state metadata fails
- **WHEN** the server refuses the empty-state save before a file clear
- **THEN** the app sends no delete for that file
- **AND** the file retains its confirmed reviewed flag and the error remains available for retry
