# Spec Delta

## ADDED Requirements

### Requirement: Whitespace filtering across changed chunks

The review SHALL apply the selected whitespace policy consistently when Gerrit supplies a replacement in one chunk or adjacent deletion and insertion chunks. All and Leading and trailing SHALL suppress highlights for leading tab changes. None and Trailing SHALL retain highlights for leading tab changes. Preference edits SHALL use the loaded content without another diff request.

#### Scenario: A block gains one leading tab

- **GIVEN** every line in a code block gains one leading tab
- **AND** Gerrit supplies the edit as one replacement chunk or separate adjacent chunks in either order
- **WHEN** the user selects All or Leading and trailing
- **THEN** the block has no diff highlight
- **WHEN** the user selects None or Trailing
- **THEN** the leading tab changes have diff highlights
- **AND** changing the preference makes no additional diff content request

#### Scenario: A loop wraps an existing block

- **GIVEN** a new loop header and closing brace surround four existing statements
- **AND** the statements gain one leading tab
- **AND** a separate edit changes a value from 2 to 3
- **WHEN** the user selects All or Leading and trailing
- **THEN** the new loop header, closing brace, and value edit have diff highlights
- **AND** the four statements have no diff highlight
- **AND** the result is the same for combined and separate adjacent replacement chunks

### Requirement: Preserve source locations and comparison boundaries

Whitespace filtering SHALL preserve displayed source text and source line and column locations. It SHALL retain unchanged Gerrit lines as comparison boundaries so repeated code across those lines cannot hide an insertion or deletion. Rebase highlights SHALL retain their Gerrit classification and cover only edits visible under the selected whitespace policy.

#### Scenario: An indented statement also changes a name

- **GIVEN** a statement gains a leading tab and changes an identifier
- **WHEN** the user selects All or Leading and trailing
- **THEN** the identifier edit remains highlighted at its actual source location
- **AND** the displayed text retains the original indentation on each side

#### Scenario: Repeated code occurs beyond an unchanged line

- **GIVEN** a removed statement and an identical inserted statement have an unchanged Gerrit line between their chunks
- **WHEN** the review computes a whitespace-filtered comparison
- **THEN** the removal and insertion remain separate visible edits
- **AND** the comparison does not match those statements across the unchanged line

#### Scenario: Rebase and ordinary edits share a changed region

- **GIVEN** adjacent changed chunks contain ordinary edits and edits classified by Gerrit as due to rebase
- **WHEN** the user changes the whitespace policy
- **THEN** each remaining visible edit keeps its ordinary or rebase color
- **AND** a filtered whitespace-only rebase edit has no rebase highlight
