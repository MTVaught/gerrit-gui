# Spec delta

## Purpose

Explain dashboard status icons and icon-only controls so users can understand their meaning with a pointer or keyboard.

## ADDED Requirements

### Requirement: Dashboard icons explain their meaning

Standard cards and the compact ledger SHALL provide visible tooltips for status icons and icon-only controls. Coverage SHALL include conflict, CI result, sequence completion, unresolved comments, branch family, sequence, private status, toolbar controls, and row icon controls. Decorative icons beside text that fully explains their meaning SHALL NOT need a separate tooltip.

#### Scenario: Same indicator in both views
- **WHEN** a user hovers or focuses an icon in either dashboard view
- **THEN** the tooltip explains its status or action in plain text with the same meaning in both views

#### Scenario: Icon control
- **WHEN** a user hovers or focuses a dashboard refresh, window-size, settings, menu, or reviewer icon control
- **THEN** its tooltip states the action the control performs and retains relevant existing context
- **AND** the control keeps an accessible name

### Requirement: Status text uses the current change context

Tooltips SHALL explain CI as continuous integration checks, separate from review approval and mergeability. A CI result SHALL include its Verified vote and patch set. Sequence completion SHALL identify the step and actual workflow state. Other status tooltips SHALL explain the count, relationship, or visibility represented by the icon.

#### Scenario: CI passes
- **WHEN** a check represents Verified +1 on patch set 3
- **THEN** its tooltip reads "CI checks passed. Verified +1 on patch set 3."

#### Scenario: CI fails
- **WHEN** an X represents Verified -1 on patch set 3
- **THEN** its tooltip reads "CI checks failed. Verified -1 on patch set 3."

#### Scenario: Sequence check
- **WHEN** step 2 has a completion check and its state is Approved
- **THEN** its tooltip reads "Step 2: Approved"
- **AND** it does not identify that check as a CI result

#### Scenario: Other status indicators
- **WHEN** a user requests help for an unresolved-comment, family, sequence, or private icon
- **THEN** the tooltip explains unresolved comment threads, related branches, changes built on each other, or Gerrit visibility respectively
- **AND** it includes the available count or relevant context

#### Scenario: Changed data
- **WHEN** a refresh changes a visible indicator's patch set, vote, branch, count, or workflow state
- **THEN** its tooltip uses the new context and does not keep obsolete text

### Requirement: Pointer and keyboard tooltip access

Tooltips SHALL open on pointer hover or keyboard focus without activation. They SHALL expose their text to assistive technology through an associated description. Noninteractive icon indicators SHALL be focusable without becoming action buttons. Escape SHALL dismiss help without activating the trigger. Dismissed help SHALL stay closed until the trigger is entered or focused again.

#### Scenario: Keyboard help
- **WHEN** a user tabs to a CI or conflict indicator
- **THEN** its tooltip opens with a visible focus marker and an associated accessible description
- **AND** no review or navigation action runs

#### Scenario: Dismiss help
- **WHEN** a user presses Escape while a tooltip is visible
- **THEN** the tooltip closes and focus remains on its trigger

#### Scenario: Pointer enters tooltip
- **WHEN** a pointer moves from an icon into its tooltip
- **THEN** the tooltip remains visible until the pointer leaves both trigger and tooltip, unless keyboard focus still holds it open or the user dismisses it

### Requirement: Tooltips fit dashboard themes and boundaries

Tooltip text, surface, and focus markers SHALL remain readable in light and dark modes. Tooltips SHALL stay inside the viewport and avoid clipping by cards, tables, and scrolling containers. Tooltips SHALL NOT change row height or icon order, intercept unrelated actions, or change workflow states, counts, permissions, or icon display rules.

#### Scenario: Compact edge
- **WHEN** a user opens help beside an edge of the compact dashboard
- **THEN** the tooltip stays readable inside the viewport without changing the row layout

#### Scenario: Both themes
- **WHEN** identical dashboard data and scroll positions are used in light and dark modes
- **THEN** the same tooltip text is readable in both modes

#### Scenario: Unknown CI result
- **WHEN** a change has no CI vote or has unknown mergeability
- **THEN** help does not introduce an extra status icon or claim a pass, failure, or conflict from the missing data
