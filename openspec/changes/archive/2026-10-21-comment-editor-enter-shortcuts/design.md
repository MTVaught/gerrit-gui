# Design

## Context

ReviewComments renders a native textarea and already handles Ctrl+Enter, Cmd+Enter, Ctrl+S, and Cmd+S on its form. InlineReviewComment uses a React portal inside a Monaco view zone. ReviewEditor stops mouse and context-menu events at the zone but does not isolate keyboard events. Native Monaco listeners can receive a key before React's form handler. See proposal.md for motivation.

## Goals / Non-Goals

Goals are to preserve native textarea input and let the shared composer handle explicit save before any code-editor commands. Review summary publication and the global review shortcut map are outside this change.

## Decisions

Stop keyboard event propagation at the inline zone after React's portal content receives the event. Do not prevent default at this boundary, so the browser can insert newlines and support normal text editing. Handling Enter only in the React form would leave native Monaco listeners earlier in the event path.

Keep explicit save in ReviewComments and retain its existing accepted modifier shortcuts. Ignore save keys during input composition. Make the Enter newline behavior visible in the existing keyboard help. Do not add custom newline insertion or a platform detection dependency.

Use a focused Electron regression with real input events. The baseline Linux fixture accepts Enter and Shift+Enter but fails the composition guard check: a simulated composing Ctrl+Enter event saves and closes the editor. Cover Enter, Shift+Enter, Ctrl+Enter, a Meta modifier check, new comments, replies, draft edits, fallback composition, autosave, and failure handling. Check input composition separately with a simulated composing event.

## Risks / Trade-offs

- Isolating zone keys can block code navigation while a comment control has focus. This is intended; verify code shortcuts still work after the composer closes.
- A Linux Meta modifier check does not verify native macOS behavior. Report the platform limit.
- A pending autosave can delay explicit save under the current guard. Keep that guard and use a settled draft in demonstrations.

## Evidence plan

Use the record-actions skill with an isolated Xvfb desktop and the existing in-memory Gerrit preload. Record the same reply and draft-edit workflow in light and dark mode, with a visible pointer, two-second hovers, and captions before Enter and Ctrl+Enter. Inspect the exports and check saved multiline text through fixture statistics. This exercises the real renderer and keyboard path; Gerrit responses are simulated.
