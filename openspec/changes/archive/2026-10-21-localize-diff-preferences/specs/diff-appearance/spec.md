# Spec delta

## MODIFIED Requirements

### Requirement: Shared theme controls

Diff Preferences and Settings > Appearance SHALL offer Light, Dark, and Follow application for the same saved Diff theme setting. Appearance SHALL use the existing theme radio style. Diff Preferences SHALL use a labeled dropdown with the same alignment, size, spacing, and styling as its Gerrit-style fields. The application Theme control SHALL retain Light, Dark, and System choices.

#### Scenario: Set the theme without opening a review

- **WHEN** a user opens Settings > Appearance with no review open and selects Dark under Diff theme
- **THEN** the setting saves immediately with the existing settings save status
- **AND** the next review and its Diff Preferences selector use Dark

#### Scenario: Set the theme from Diff Preferences

- **WHEN** a user selects Light under Diff theme in Diff Preferences
- **THEN** the review applies Light and the application persists the choice automatically
- **AND** Settings > Appearance uses the same saved Light choice
- **AND** Diff Preferences stays open without requiring Save

#### Scenario: Match the Diff Preferences form

- **WHEN** a user opens Diff Preferences in light or dark mode, including at compact widths
- **THEN** Diff theme uses a label and dropdown aligned with Context and Ignore Whitespace
- **AND** its font, control size, border, padding, and row spacing match the existing fields
- **AND** no Diff theme explanatory subtext or separate theme save status is shown

#### Scenario: Use the keyboard

- **WHEN** a user focuses a Diff theme control and uses its standard keyboard controls
- **THEN** Appearance uses radio group keyboard behavior and Diff Preferences uses select keyboard behavior
- **AND** each control has a readable label and visible focus indicator in light and dark mode

### Requirement: Local persistence and save feedback

The diff theme SHALL persist automatically in application settings for desktop and browser mode when changed in either control. Missing or invalid values SHALL resolve to Follow application. Closing Diff Preferences with Close or Escape SHALL retain successful edits. Theme changes SHALL NOT read or write Gerrit account diff preferences. A failed theme write SHALL show an accessible error and retain the last saved theme without undoing other successful preference edits.

#### Scenario: Reopen and save unrelated settings

- **WHEN** a user changes a diff theme, saves an unrelated setting, and restarts the application
- **THEN** both selectors and the review retain the saved diff theme

#### Scenario: Open older or invalid settings

- **WHEN** saved settings contain no diff theme or an unsupported diff theme value
- **THEN** the review follows the application
- **AND** both selectors show Follow application

#### Scenario: Theme save fails

- **GIVEN** the saved diff theme is Follow application
- **WHEN** a user selects Dark in Diff Preferences and the automatic application settings write fails
- **THEN** the dialog stays open and shows the failure
- **AND** the review and both selectors retain Follow application
- **AND** the user can select Dark again to retry without Save

#### Scenario: Discard draft selections

- **WHEN** a user changes the diff theme and another preference successfully and selects Close or presses Escape
- **THEN** both edits remain applied and persisted
- **AND** there are no staged selections to discard
- **AND** reopening Diff Preferences shows the saved choices

#### Scenario: Save theme with other preference edits

- **WHEN** a user changes the diff theme and other review preferences in Diff Preferences
- **THEN** each valid change applies and persists automatically through local application storage
- **AND** a failed theme write retains the last saved theme without undoing successful changes to other preferences
- **AND** no Gerrit account preference write is required

#### Scenario: Gerrit writes are unavailable

- **WHEN** the user changes the diff theme while Gerrit writes are unavailable or the review is read-only
- **THEN** the application settings write can persist the diff theme independently
- **AND** no Gerrit account preference request is made
