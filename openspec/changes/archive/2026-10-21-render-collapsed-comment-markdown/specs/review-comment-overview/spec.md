# Spec delta

## ADDED Requirements

### Requirement: Collapsed comments render Markdown

Collapsed inline comments and comments in All comments SHALL render their message as Markdown in light and dark mode. Bold text, inline code, and links SHALL remain readable. Headings, lists, code blocks, and explicit line breaks SHALL fit in the existing single-line preview without increasing the collapsed row height.

#### Scenario: Scan a collapsed comment

- **WHEN** a reviewer reads a collapsed comment with bold text, inline code, a link, and a quotation in either comment view
- **THEN** the preview shows formatted content instead of Markdown delimiters
- **AND** the preview stays on one line

#### Scenario: Collapse block content

- **WHEN** a reviewer collapses a comment containing headings, lists, code blocks, or explicit line breaks
- **THEN** the content stays in one preview line with separation between words
- **AND** expanding the comment restores its normal block formatting and line breaks

### Requirement: Collapsed preview links preserve comment state

Activating an HTTP or HTTPS link in a collapsed preview SHALL use the existing external-link action without expanding the comment. Activating preview text or its toggle SHALL retain normal expansion and collapse behavior. Existing restrictions on links and images SHALL remain in effect.

#### Scenario: Open a preview link

- **WHEN** the reviewer activates a link in a collapsed preview
- **THEN** the app sends the link to its external-link action
- **AND** the comment stays collapsed

#### Scenario: Expand formatted preview text

- **WHEN** the reviewer activates formatted preview text or the expansion toggle
- **THEN** the full comment opens with its normal Markdown rendering
- **AND** collapsing it restores the formatted preview
