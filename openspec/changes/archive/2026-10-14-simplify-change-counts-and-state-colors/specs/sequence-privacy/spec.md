## Purpose

Keep private changes separate from public review sequences in the board and in sequence actions.

## ADDED Requirements

### Requirement: Private changes cannot join a sequence

The application SHALL exclude private changes from sequence cards, sequence candidate sets, and sequence picker lists. This rule SHALL also apply to private cherry-picks of sequence members. A private member SHALL stop a sequence dependency chain.

#### Scenario: Old sequence tag on a private change

- **WHEN** a private change has a sequence tag
- **THEN** it does not appear in a sequence card or picker
- **AND** the owner can access it in Private

#### Scenario: Private cherry-pick

- **WHEN** a public sequence member has a private cherry-pick
- **THEN** the private cherry-pick stays outside the sequence card

### Requirement: Sequence writes reject private members

The application SHALL check each change before it adds a sequence tag. If any selected change is private, it SHALL reject the action before it writes any tags. This check SHALL apply to sequence actions and direct hashtag actions.

#### Scenario: Private member in a sequence action

- **WHEN** an action tries to add a public change and a private change to a sequence
- **THEN** the action fails with an explanation and no sequence tags are written

### Requirement: Making a change private removes its sequence tag

When the user makes a change private, the application SHALL set the private flag and remove its sequence tag. The board SHALL keep the change out of sequences even if a tag removal fails or another client sets the private flag.

#### Scenario: A sequence member becomes private

- **WHEN** the user makes a sequence member private
- **THEN** its private flag is set and its sequence tag is removed
- **AND** the change leaves the sequence card and does not add to My Changes pills
