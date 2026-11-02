# Spec delta

## ADDED Requirements

### Requirement: Inline draft editing preserves review position

Selecting Edit on a visible inline draft SHALL preserve the comment's screen position and the surrounding diff scroll position while opening and focusing its text field. This SHALL apply to single drafts and draft replies in side-by-side and unified layouts, in light and dark mode. Editing SHALL retain the saved draft identity and anchor.

#### Scenario: Edit a single draft

- **WHEN** a reviewer selects Edit on a visible single draft partway down the diff
- **THEN** its text field opens at the same comment position and receives keyboard focus
- **AND** both code panes keep their scroll positions
- **AND** the reviewer can change and save the text on the same draft and anchor

#### Scenario: Edit a draft reply

- **WHEN** a reviewer selects Edit on a visible saved reply in an inline thread
- **THEN** the reply text field opens in that thread without moving the thread or diff scroll position
- **AND** the field receives keyboard focus and retains the reply's saved identity and anchor

#### Scenario: Edit while the anchor is above the viewport

- **GIVEN** a tall thread has its code anchor above the viewport but its draft and Edit button are visible
- **WHEN** a reviewer selects Edit
- **THEN** the visible draft remains at its current position and the diff does not jump back to the anchor

