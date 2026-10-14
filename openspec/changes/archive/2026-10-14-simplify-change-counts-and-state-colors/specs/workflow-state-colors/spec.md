## Purpose

Keep workflow-state colors consistent across application views so users can recognize the same state wherever it appears.

## ADDED Requirements

### Requirement: Shared state color meanings

Workflow state indicators SHALL use red for Needs changes, purple for Ready to merge, green for Approved, indigo for In review, amber for Iterating, and gray for In progress. Pass-around and in-person review SHALL share indigo. This mapping SHALL apply to tab segments, state badges, state borders, compact ledger indicators, and colored tray action categories.

#### Scenario: Ready to merge throughout the application

- **WHEN** Ready to merge is represented in a tab segment, card badge or border, compact ledger indicator, or colored tray merge category
- **THEN** it uses the purple state family rather than Approved green or a generic tab accent

#### Scenario: Review colors agree

- **WHEN** pass-around review, in-person review, or the tray Needs Review action is represented by a workflow color
- **THEN** it uses indigo

#### Scenario: Draft stages are distinguishable

- **WHEN** Iterating and In progress appear together
- **THEN** Iterating uses amber and In progress uses gray

### Requirement: Theme and surface appropriate variants

State colors SHALL remain readable in light and dark modes and preserve their color-family meaning across filled pills, text, and borders. The six adjacent My Changes segments SHALL remain distinguishable. Solid tray pills SHALL retain readable digits on their existing solid surfaces.

#### Scenario: Theme switch

- **WHEN** the same board and counts are displayed in light and dark modes
- **THEN** each state retains its assigned color family with readable text and visible boundaries

#### Scenario: All states present

- **WHEN** all six My Changes counts are nonzero
- **THEN** they appear red, purple, green, indigo, amber, and gray in that order in either theme

### Requirement: State color changes preserve unrelated semantics

Color standardization SHALL preserve unrelated interface colors and presentation semantics, including generic controls, app icons, reviewer avatars, vote outcomes, CI results, and closed-state styling. It SHALL NOT recolor a mixed-state sequence as though every member shared one state.

#### Scenario: Mixed-state sequence

- **WHEN** a sequence contains members in several workflow states
- **THEN** its member indicators use their respective state colors without assigning the whole sequence a single workflow state

#### Scenario: Generic accent

- **WHEN** a blue control or app icon does not indicate a workflow state
- **THEN** its existing accent color is retained
