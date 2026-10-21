# Design

## Context

See proposal.md for the request. Both comment views share ReviewComments. The source thread changed its collapsed message to use ReviewMarkdown, which already restricts links to HTTP and HTTPS and renders image references as text. Compact rendering also affects block layout and click propagation, so these decisions need explicit checks.

## Goals / Non-Goals

Use the same Markdown rules in expanded and collapsed views. Preserve the row dimensions, comment state, external-link behavior, and existing expanded rendering.

## Decisions

- Reuse ReviewMarkdown instead of adding a second parser. A compact option converts hard breaks to spaces; expanded rendering keeps normal breaks.
- Scope inline display and spacing rules to the collapsed preview. Keep headings, lists, quotations, and code blocks within its existing overflow boundary.
- Exclude anchors from the heading's expansion click handler, as buttons already are. A link click must reach the external-link action once without changing expansion.
- Use the existing Electron fixture with real input for expansion and link activation. Check Markdown elements and row height, then capture the same inline view in both themes.

## Risks / Trade-offs

- Block elements can increase preview height. Check lists, headings, fenced code, and hard breaks explicitly.
- A link shares the clickable heading. Check that a click opens the URL and leaves the comment collapsed.
- Linux fixture checks do not establish native macOS or Windows behavior. State that limit in verification.
