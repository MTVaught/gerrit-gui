# Design

## Context

`ReviewComments` renders single draft composers in a separate inline host and reply composers within the existing thread. `InlineReviewComment` focuses the field over several animation frames and calls the host's reveal function during that period. Single saved drafts currently pass `preserveScroll=false`; replies use that default too. The host then places the comment near the top of the viewport. Its preserve mode also checks the code anchor, which can be offscreen while a tall comment remains visible.

## Goals / Non-Goals

Goals are stable inline edit placement and reliable text focus through Monaco layout updates. Keep draft persistence and saved anchors intact. Navigation from the comment overview or publish list must still reveal its target. No API, storage, or theme changes are needed.

## Decisions

1. Keep visible draft editors within their existing thread host. Replace the draft body with its composer so Edit does not remove and recreate a view zone. Use scroll-preserving focus for this in-place transition. The existing reveal path remains available when a composer must be brought into view from elsewhere.
2. Keep normal new-comment and reply opening behavior. Apply scroll-preserving focus to an existing draft within a visible thread. Extend the host's preserve check to include the visible field or thread, since the code anchor can be offscreen.
3. Verify through the built Electron renderer with the existing simulated Gerrit preload. Use native mouse clicks, keyboard input, and wheel input for the demonstrated workflow. Compare stable code-line and thread coordinates before and after Edit, verify focus, and verify saved draft identity and anchor. Record matched light and dark mode clips on an isolated Linux Xvfb display with pointer, hover pauses, and captions.

## Risks / Trade-offs

- Monaco may adjust its scroll position when view-zone heights change. Reuse the host and check both panes through the initial focus and resize period.
- Tall threads can have offscreen anchors. Include a case where Edit is visible while its anchor is above the viewport.
- Overview navigation still needs reveal behavior. Check that this path opens the target field, along with existing new-comment position and reply checks.
- Linux fixture checks do not establish native Windows or macOS behavior. State the tested platform and simulated data in the evidence notes.
