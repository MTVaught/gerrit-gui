# Spec Delta

## ADDED Requirements

### Requirement: Shared review divider position

The review window SHALL retain one divider ratio between the original and modified panes across file and comparison changes. The latest divider adjustment SHALL apply to both newly opened and cached files in light and dark mode. Each file SHALL retain its own cursor and scroll state.

#### Scenario: Open another file

- **WHEN** a reviewer drags the divider in one file and opens another file
- **THEN** the divider retains the same ratio
- **AND** a loading screen does not reset the ratio

#### Scenario: Return to a cached file

- **WHEN** a reviewer adjusts the divider in a second file and returns to the first file
- **THEN** the first file uses the latest divider ratio
- **AND** the first file restores its own cursor and scroll state

#### Scenario: Change comparison

- **WHEN** a reviewer changes the compared patch set
- **THEN** the review retains the latest divider ratio

#### Scenario: Resize the review window

- **WHEN** a reviewer resizes the review window and switches files
- **THEN** the panes retain the shared ratio within their minimum width limits

#### Scenario: Use the full divider range

- **WHEN** a reviewer drags either pane to its minimum width and switches files
- **THEN** the divider retains that position at the same window size
