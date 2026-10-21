# Proposal

## Why

Collapsed review comments show raw Markdown syntax. Reviewers need the same readable formatting when they scan collapsed comments as when they expand a thread.

## What Changes

- Render Markdown in collapsed inline comments and the All comments overview.
- Keep each preview on one line, including headings, lists, code blocks, and explicit line breaks.
- Keep links usable without expanding the comment. Retain the existing external-link and image handling.
- Verify expansion, collapse, and both themes with real Electron input and paired screenshots.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `review-comment-overview`: Formatted collapsed previews in both review comment views.

## Impact

The shared comment and Markdown components, compact-preview CSS, and a focused Electron regression are affected. No API, saved-data, or dependency change is required. The source thread already contains an implementation. Apply will verify that implementation against this contract before sync, archive, and commit.
