# Spec delta

## MODIFIED Requirements

### Requirement: Warning identifies its meaning

The warning triangle SHALL have a visible tooltip on hover and keyboard focus and an accessible name of "Merge conflict with <branch>", where <branch> is the change's destination branch. The tooltip SHALL use that same text and the shared dashboard tooltip interaction rules. The icon shape and text SHALL identify the warning without relying on color alone.

#### Scenario: Destination branch in the warning
- **WHEN** an open change targeting release has a conflict warning
- **THEN** its hover text and accessible name are "Merge conflict with release"

#### Scenario: Keyboard access to the warning
- **WHEN** a user focuses a conflict warning for a change targeting release
- **THEN** a visible tooltip and associated accessible description state "Merge conflict with release"
- **AND** pressing Escape dismisses the tooltip without changing the change
