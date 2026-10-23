# Spec delta

## MODIFIED Requirements

### Requirement: Deliver review navigation after window activation

With separate windows off, the app SHALL restore, show, and focus its main window for native in-app review navigation. Requests SHALL wait for readiness, with the last selection taking precedence. With separate windows on, each selection SHALL open and focus its own review-only window and wait for that window's readiness. Neither mode SHALL lose its selected review during startup. Settings and compact mode SHALL NOT prevent review access.

#### Scenario: Restore a hidden or minimized window
- **WHEN** the user selects a change with in-app reviews enabled and separate windows off while the main window is hidden or minimized
- **THEN** the main window becomes visible and focused with that review open

#### Scenario: Request arrives during renderer startup
- **WHEN** the user selects a change with separate windows off while the main window is being created or its renderer is loading
- **THEN** the app opens that review once its UI is ready and does not lose the request

#### Scenario: Several selections precede readiness
- **WHEN** two changes are selected with separate windows off before the review UI is ready
- **THEN** the app opens the last selected change without a later response replacing it with the earlier selection

#### Scenario: Open from the native menu in separate-window mode
- **WHEN** the user selects an enabled native change entry with in-app reviews and separate windows enabled
- **THEN** a review-only window opens and receives focus
- **AND** the main window keeps its current visibility, Settings view, and compact mode

#### Scenario: Several separate windows start together
- **WHEN** two native change entries are selected with separate windows enabled before either review window is ready
- **THEN** each selection opens in its own window with its own subject and comparison
- **AND** delayed metadata or readiness from one window cannot cancel or retarget the other

#### Scenario: Select the same native entry twice
- **WHEN** the user selects the same enabled native entry twice with separate windows enabled
- **THEN** two independent review windows open for that change
