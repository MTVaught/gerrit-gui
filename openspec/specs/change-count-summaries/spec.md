# change-count-summaries Specification

## Purpose

Give users a predictable summary of their public open changes while keeping section headings free of competing card totals.

## Requirements

### Requirement: Count individual eligible changes

My Changes state pills SHALL count each distinct public open change displayed in the unfiltered tab once, including family and sequence members owned by other users. Private changes, closed changes, and changes in cards absent from the tab SHALL contribute nothing. Grouping SHALL NOT reduce the number of changes counted.

#### Scenario: Mixed sequence with context

- **WHEN** a sequence displays two public open changes and one merged change, and the tab also contains a private open change
- **THEN** only the two public open changes contribute, each to its own state

#### Scenario: Cherry-pick family

- **WHEN** a family contains three public open changes on different branches, including branches owned by other users
- **THEN** all three count individually according to their states, even though they share a card

#### Scenario: Another owner's cherry-pick

- **WHEN** a displayed family includes a public open cherry-pick owned by someone else
- **THEN** that cherry-pick contributes to its own state count, just as a branch owned by the current user does

#### Scenario: Changes outside the tab

- **WHEN** another owner's public open change is available to the application but its card is absent from My Changes
- **THEN** that change does not contribute to My Changes pills

#### Scenario: Shared family references

- **WHEN** the same change is referenced by more than one sequence
- **THEN** that change contributes at most once

### Requirement: Six mutually exclusive state counts

My Changes SHALL summarize eligible changes in fixed order: Needs changes, Ready to merge, Approved, In review, Iterating, In progress. In review SHALL combine pass-around and in-person review. Every eligible change SHALL contribute to exactly one count using its existing classified state.

#### Scenario: Review modes share one count

- **WHEN** two eligible changes are in pass-around review and one is in in-person review
- **THEN** In review is three

#### Scenario: Approved and handed off

- **WHEN** one eligible change is Approved and another is Ready to merge
- **THEN** each contributes one to its respective count, without double counting

#### Scenario: Draft stages remain separate

- **WHEN** one eligible change is Iterating and two are In progress
- **THEN** Iterating is one and In progress is two

### Requirement: Stable numeric presentation

My Changes SHALL show numeric-only state segments in fixed order, omit zero counts, and show no pill when all six counts are zero. It SHALL have no sequence, private, remainder, or total segment. Segments SHALL be informational, without filtering actions or individual tooltips. Existing aggregate hover information SHALL describe the displayed counts accurately.

#### Scenario: Some states are empty

- **WHEN** only Ready to merge and Iterating are nonzero
- **THEN** only those two segments appear in that order, without filling empty positions

#### Scenario: Only private changes remain

- **WHEN** the user has open private changes but no public open changes
- **THEN** My Changes has no count pill, including no zero or lock count, while private changes remain accessible in the tab

#### Scenario: Segment interaction

- **WHEN** the user clicks a count segment
- **THEN** no state filter is applied, and ordinary tab selection behavior remains available

### Requirement: Counts cover the whole tab

My Changes state counts SHALL remain independent of the active View search and author filters, sorting, compact mode, and grouped-card presentation.

#### Scenario: Filter hides all eligible changes

- **WHEN** the View filter matches none of public open changes displayed in the unfiltered tab
- **THEN** the pills retain the counts for all of public open changes displayed in the unfiltered tab

### Requirement: Section headings omit counts throughout the application

Every tab SHALL omit numeric counts beside section headings in standard and compact views, including Sequences and Private sections. Branch counts and sequence size SHALL remain. Headers SHALL NOT show state totals. Each member SHALL keep its state label.

#### Scenario: Standard and compact sections

- **WHEN** any tab is displayed in standard or compact mode
- **THEN** section headings show their titles and existing hints without section count badges
- **AND** family branch counts and sequence size remain, with no state totals in their headers

### Requirement: Other summaries retain their eligibility rules

Other tabs and tray action summaries SHALL retain their existing counting units, eligibility, category order, and zero-display settings. Sharing colors SHALL NOT require their numbers to equal My Changes state counts.

#### Scenario: Displayed work differs from merge responsibility

- **WHEN** the user owns two Ready to merge changes and is asked to merge three changes owned by others
- **THEN** My Changes reports the two displayed Ready to merge changes and the tray retains its existing merge-action counting rules for the user's merge responsibilities
