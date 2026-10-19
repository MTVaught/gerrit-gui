# Spec delta

## Purpose

Let users select a separate theme for in-app reviews and find the same saved setting in Diff Preferences and application Appearance settings.

## ADDED Requirements

### Requirement: Independent diff theme

The application SHALL provide Light, Dark, and Follow application diff theme choices. Follow application SHALL be the default and use the resolved application theme, including device appearance changes when the application uses System. Explicit diff choices SHALL remain fixed when the application theme changes.

#### Scenario: Follow the application rather than the device

- **GIVEN** the device uses dark mode and the application uses Light
- **WHEN** the diff theme is Follow application
- **THEN** the review uses light mode
- **AND** changing the application theme to Dark updates the open review to dark mode

#### Scenario: Follow device changes through the application

- **GIVEN** the application theme is System and the diff theme is Follow application
- **WHEN** the device appearance changes
- **THEN** the open review follows the new resolved application theme

#### Scenario: Keep an explicit override

- **WHEN** the diff theme is Light or Dark and the application or device appearance changes
- **THEN** the review keeps the selected diff theme
- **AND** the board and settings continue to use the application theme

### Requirement: Shared theme controls

Diff Preferences and Settings > Appearance SHALL offer Light, Dark, and Follow application for the same saved Diff theme setting. Appearance SHALL use the existing theme radio style. Diff Preferences SHALL use a labeled dropdown with the same alignment, size, spacing, and styling as its Gerrit-style fields. The application Theme control SHALL retain Light, Dark, and System choices.

#### Scenario: Set the theme without opening a review

- **WHEN** a user opens Settings > Appearance with no review open and selects Dark under Diff theme
- **THEN** the setting saves immediately with the existing settings save status
- **AND** the next review and its Diff Preferences selector use Dark

#### Scenario: Set the theme from Diff Preferences

- **WHEN** a user selects Light under Diff theme in Diff Preferences
- **THEN** only the dialog's draft selection changes
- **AND** the review and Settings > Appearance retain the saved theme
- **WHEN** the user selects Save and the required writes succeed
- **THEN** the review and Settings > Appearance use Light

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

The diff theme SHALL persist in application settings for desktop and browser mode. Missing or invalid values SHALL resolve to Follow application. Diff Preferences SHALL commit the theme only on Save and discard uncommitted changes on Cancel or Escape. A theme-only Save SHALL NOT write Gerrit preferences. A failed required write SHALL keep the dialog open with its draft and an error. A failed theme write SHALL retain the last saved theme.

#### Scenario: Reopen and save unrelated settings

- **WHEN** a user saves a diff theme, saves an unrelated setting, and restarts the application
- **THEN** both selectors and the review retain the saved diff theme

#### Scenario: Open older or invalid settings

- **WHEN** saved settings contain no diff theme or an unsupported diff theme value
- **THEN** the review follows the application
- **AND** both selectors show Follow application

#### Scenario: Theme save fails

- **GIVEN** the saved diff theme is Follow application
- **WHEN** a user selects Dark in Diff Preferences, selects Save, and the application settings write fails
- **THEN** the dialog stays open with Dark selected and shows the failure
- **AND** the review retains Follow application
- **AND** the user can retry Save

#### Scenario: Discard draft selections

- **WHEN** a user changes the diff theme and another preference in Diff Preferences and selects Cancel or presses Escape before saving
- **THEN** both edits are discarded
- **AND** the saved theme and review appearance remain unchanged

#### Scenario: Save theme with other preference edits

- **WHEN** a user edits the diff theme and Gerrit-backed preferences and selects Save
- **THEN** the theme commits only after the required Gerrit write succeeds
- **AND** a failed Gerrit write leaves the theme unchanged and keeps the dialog open with the draft and error
- **AND** a later theme write failure keeps confirmed Gerrit changes and permits retry of the pending theme write

#### Scenario: Gerrit writes are unavailable

- **WHEN** only the diff theme is changed in Diff Preferences and the user selects Save while Gerrit writes are unavailable or the review is read-only
- **THEN** the application settings write can save the diff theme independently
- **AND** no Gerrit preference request is made for that theme change

### Requirement: Consistent review appearance and continuity

The effective diff theme SHALL apply to the in-app review, code editor, and review dialogs, including Diff Preferences and All comments. A theme change SHALL preserve the selected file, comparison, code position, and drafts. Closing the review SHALL leave the application theme in effect elsewhere.

#### Scenario: Apply an opposing theme

- **GIVEN** the application uses Light and the diff theme uses Dark, or the reverse
- **WHEN** a user opens a review and its dialogs
- **THEN** review controls, code, comments, highlights, and dialogs use the effective diff theme with readable text and focus indicators
- **AND** application settings and the board use the application theme

#### Scenario: Change theme during a review

- **GIVEN** a reviewer has selected a file and comparison, scrolled the code, and entered a draft
- **WHEN** the effective diff theme changes
- **THEN** the review changes appearance without losing that file, comparison, code position, or draft
- **AND** closing the review leaves the board on the application theme
