# Spec delta

## Purpose

Let users open changes from native system tray and menu bar entries in the app review viewer when they have enabled in-app reviews.

## ADDED Requirements

### Requirement: Native change entries respect the review preference

The app SHALL open enabled native menu change entries in its review viewer when "Open reviews in the app" is enabled. When disabled, each entry SHALL retain its existing browser destination. A saved preference change SHALL apply to the next selection without a restart.

#### Scenario: Select a change with opt-in enabled
- **WHEN** the user enables in-app reviews and selects a change under Needs Review, Needs Changes, Approved, or Ready to merge in the native menu
- **THEN** the app opens that change in its review viewer without opening a browser

#### Scenario: Turn the preference off while the app runs
- **WHEN** the user disables in-app reviews and selects a native menu change entry
- **THEN** a Needs Review entry opens its existing Gerrit diff URL and an entry in another category opens its existing Gerrit change page URL

### Requirement: Preserve the selected change and comparison

Native review navigation SHALL open the selected member of a single change, branch family, or sequence. Needs Review SHALL preserve its target and base patch sets. Other categories SHALL open the selected change's current patch set against base. A grouped menu title SHALL NOT replace the selected change's own review title.

#### Scenario: Review changes since the last review
- **WHEN** the selected Needs Review entry targets patch set 5 compared with patch set 3
- **THEN** the app opens patch set 5 against patch set 3 for that entry's change

#### Scenario: Open an owner change or merge candidate
- **WHEN** the selected entry belongs to another category and its current patch set is 4
- **THEN** the app opens patch set 4 against base for that change

#### Scenario: Select a member of a sequence or branch family
- **WHEN** the user selects an enabled member in a grouped native submenu
- **THEN** the review shows that member's change, project, comparison, and own subject

### Requirement: Deliver review navigation after window activation

The app SHALL restore, show, and focus its main window for native in-app review navigation. A request received before the review UI is ready SHALL remain pending until it can be handled. If several requests arrive before readiness, the last selection SHALL take precedence. The review SHALL be accessible when Settings is visible or compact mode is active.

#### Scenario: Restore a hidden or minimized window
- **WHEN** the user selects a change with in-app reviews enabled while the main window is hidden or minimized
- **THEN** the main window becomes visible and focused with that review open

#### Scenario: Request arrives during renderer startup
- **WHEN** the user selects a change while the main window is being created or its renderer is loading
- **THEN** the app opens that review once its UI is ready and does not lose the request

#### Scenario: Several selections precede readiness
- **WHEN** two changes are selected before the review UI is ready
- **THEN** the app opens the last selected change without a later response replacing it with the earlier selection

### Requirement: Protect active review edits and report navigation errors

Native navigation SHALL use the viewer's existing unsaved-edit and pending-write checks before changing the active review. A failed request SHALL show an error in the app and SHALL NOT silently open a browser. Canceling navigation SHALL preserve the current review and its unsaved edits.

#### Scenario: Keep unsaved edits
- **WHEN** a native selection would replace the active review and the user declines the existing discard prompt
- **THEN** the app keeps the current review and its edits

#### Scenario: Metadata cannot be loaded
- **WHEN** the app cannot resolve the selected change's subject or required patch set
- **THEN** it reports the failure visibly, preserves any active review, and does not open a browser

### Requirement: Preserve unrelated native and browser actions

The change SHALL preserve category tab navigation, native icon click preferences, disabled menu entries, category membership, and counts. Explicit "Open change page" actions, change title links, and copied Gerrit URLs SHALL retain their existing behavior.

#### Scenario: Select a category tab action
- **WHEN** the user selects an empty category or "Open the Needs Review tab"
- **THEN** the app opens that board tab without selecting a change or opening a review

#### Scenario: Use the native icon click preference
- **WHEN** the user clicks the native icon with its existing menu or My Reviews preference
- **THEN** the existing menu or Needs Review tab behavior remains in effect

#### Scenario: Select an explicit web action
- **WHEN** the user selects "Open change page" from the board with in-app reviews enabled
- **THEN** the app opens the Gerrit change page in the browser

#### Scenario: An inactive group member is listed
- **WHEN** a branch family or sequence contains a disabled member
- **THEN** that entry remains disabled and cannot open a review
