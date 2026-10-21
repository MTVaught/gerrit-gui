# Design

## Context

See `proposal.md` for the problem. `ReviewComments.tsx` builds one shared composer form with a native Draft comment textarea and optional Suggested replacement textareas. `InlineReviewComment.tsx` portals that form into a Monaco view zone. The same form can appear in a fallback dialog.

`ReviewEditor.createInlineHost` stops native mouse-down and context-menu propagation at the zone node. It has no wheel handler. Monaco's installed scrollable element handles wheel events on an ancestor, then calls `preventDefault` when it consumes the gesture. This is a likely event conflict based on source inspection, not a runtime reproduction.

Existing CSS permits vertical resize and sets minimum field heights. A ResizeObserver measures the inline content and updates its view-zone height. `test/review-comment-scroll-ui.cjs` already verifies that opening, typing, saving, and cancelling comments preserve the selected code line, but does not scroll overflowing text fields.

## Goals / Non-Goals

Goals:

- Resolve wheel ownership before Monaco handles the native event.
- Keep browser text scrolling and caret behavior, without copying scroll deltas into application state.
- Use the shared composer boundary so inline and fallback fields have the same rules.

Non-goals:

- Do not replace native textareas, introduce automatic height growth, or change published comment rendering.
- Do not change reply anchors, draft identity, shortcuts, or review summary dialogs.

## Decisions

### Stop propagation before the event reaches Monaco

Install a native bubbling wheel listener on the shared composer DOM element, with cleanup when that element unmounts. Resolve whether the event target belongs to a composer textarea. If that field has vertical overflow, stop propagation while retaining the browser default action. Check the current `scrollHeight` and `clientHeight` on each gesture, so edits, wrapping, and manual resize take effect without cached dimensions.

This listener runs inside the portal's physical DOM ancestry before Monaco's ancestor listener. A React-only wheel handler can run too late because portal event delegation occurs elsewhere. A listener on the inline host alone would omit the fallback composer. A blanket zone listener would also trap gestures over controls and short fields.

Keep native delta handling for pixel, line, and page wheel events. Do not use `preventDefault` for ordinary text scrolling or change focus. Preserve modified wheel gestures used for zoom, including Ctrl+wheel trackpad pinch events.

### Contain scrolling at an overflowing field's boundaries

Use vertical overscroll containment for the overflowing field to prevent browser scroll chaining after the event listener leaves default scrolling enabled. Update containment on input and composer layout changes through a ResizeObserver, and recheck current overflow in the wheel listener. Clear containment when the field no longer overflows. Scope the style to composer textareas.

Stopping propagation prevents Monaco's custom scroll handler. It does not by itself prevent the browser from chaining a default scroll into a fallback dialog at a boundary. Both checks are needed. Do not change the editor's global wheel options or synthesize scrolling by multiplying `deltaY`.

### Retain layout, focus, and draft lifetime

Keep the existing textarea dimensions, resize handle, view-zone ResizeObserver, focus reveal, and draft state. Internal scrolling must not resize the host, remount the composer, move selection, or trigger a save. Existing keyboard and context-menu handlers remain responsible for editing behavior.

The new `review-comment-composition` spec adds text-entry behavior. It does not replace the original-anchor requirements in `review-comment-replies` or thread-list scrolling in `review-comment-overview`.

## Risks / Trade-offs

- Native default scrolling can differ from synthetic dispatch. Use real wheel input and observe textarea scrollTop, both editor pane offsets, and outer dialog position. Do not treat `dispatchEvent` as proof of scrolling.
- Overscroll containment can trap short fields if applied too broadly. Recheck overflow during each gesture and test resizing a field until all text fits.
- Portal lifetime can leave duplicate listeners. Bind and dispose through the composer DOM lifetime and test reopening a draft.
- Focus reveal and autosave can obscure a scroll jump. Let initial layout settle, check focused and unfocused fields, and wait through autosave during the regression workflow.
- A mouse-wheel test does not prove physical trackpad input on every OS. Exercise available input types and state the tested platform and any untested hardware.

## Migration plan

Ship a renderer-only change with no data migration. Revert the event handling and scoped styles to roll back. Draft formats and Gerrit writes remain compatible.

## Verification and evidence

Extend `test/review-comment-scroll-ui.cjs` using its simulated Gerrit data. Insert a numbered multiline comment through input, settle autosave, move the pointer over the field, and send real wheel input in both directions. Check internal movement, first and last line reachability, unchanged message, and stable editor offsets. Repeat at both boundaries, without focus, for replies, edited drafts, suggested replacements, and the fallback composer. Cover original and modified panes plus unified layout, short fields, scrolling over code, keyboard caret movement, scrollbar drag, manual resize, Save, Cancel, and reopening.

Run the relevant comment UI workflows, `pnpm test`, and `pnpm typecheck`. Use the `record-actions` skill during implementation for matched light and dark videos with a visible pointer, about two seconds of hover before clicks, brief action captions, and a pause on the result. Use the same data, starting view, scroll position, and pacing. Inspect both videos and state the platform, fixture use, and any capture or input limitation.

For this planning-only change, capture and inspect static light and dark proposal mockups with identical simulated data and field scroll positions. Label them as proposed layout, not proof of runtime scrolling. Save the HTML source and capture details beside the previews. No project code is changed in this workflow.
