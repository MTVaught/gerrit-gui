# Design

## Context

See proposal.md for the problem and specs/ for the behavior contracts.

- `src/main/index.ts` owns one board window and one connection window. The board close handler hides it to the tray. Review windows need a different lifecycle.
- `NativeReviewNavigation` keeps one pending selection, cancels older metadata requests, and sends `app:review` only to the board. That is correct for the default viewer but would lose separate-window requests.
- `src/renderer/src/main.tsx` selects ConnectionWindow or App from a hash. App mounts the board, polling, badges, and LocalReviewProvider. A second App would create another board instance and repeat those effects.
- LocalReview renders a modal dialog, maps U to closeReview, and closes on dialog cancellation. Its editor session and view caches are already local to the mounted review.
- Diff preferences live in renderer localStorage. Settings use a serialized main-process store, but the renderer reads a complete settings snapshot before saving it. Serialization alone cannot prevent stale snapshots from replacing unrelated fields.
- ReviewComments polls discussion every 30 seconds and autosaves after 600 ms. Draft save/delete paths do not all pass through the board mutation callback. Confirmed writes need a common notification point.
- RendererBoundary pins trusted app documents and denies arbitrary window creation. New windows must use that boundary and existing sandbox settings.

## Goals / non-goals

Goals are to give each desktop review its own renderer and view state, keep shared state ordered, and use one app process and service. The main process must enforce each review window's assigned change, even if its renderer hash changes.

Browser popups, a second app process, cross-device text editing, and a general-purpose window manager are outside this design. The existing embedded viewer remains the default. Concurrent editing protection covers windows in this app process; it does not claim a server-side atomic edit protocol for other Gerrit clients.

## Decisions

### Create review windows in the main process

Add a registry keyed by window instance ID, never by change ID. Store the assigned ChangeLink, subject, connection generation, and startup delivery state. Use a separate BrowserWindow with the existing sandboxed preload and RendererBoundary. Do not attach it as a child whose destruction follows the board.

Expose a typed request to open a review and a typed method to read the calling window's context. Main-process registration determines whether the caller is a board, connection, or review window. The renderer hash can select a screen but cannot authorize or change the registered review identity. Review IPC checks change IDs against that context and rejects board navigation, badge ownership, compact mode, and opening another review from that window. Global diff preference edits remain available through the existing controls.

Choose a new ReviewWindow root in main.tsx. Mount the settings/theme provider and a reusable review content component without App, Board, dashboard polling, or badge effects. Extract LocalReview's content as needed while retaining the modal wrapper for embedded reviews. A missing context shows an error and close action. Reload reads the registered context again.

Review windows disable background throttling so a covered window can render confirmed data updates and inline comments. The integration test checks updates without a focus change.

Opening another App or using window.open was rejected because either can expose board navigation or bypass the current controlled window lifecycle.

### Route every review open through one destination decision

Persist `separateReviewWindows`, default false. Add its autosave control under Settings > Window, disabled when localReview is false. Browser mode does not expose it. A setting change affects future opens only.

Board review actions and native menu review actions use the same destination decision. Preserve the exact ChangeLink and subject. When enabled, allocate a distinct request/window for every selection and retain delivery until that window is ready. Slow metadata for one selection cannot cancel another. Errors appear in a review-only error view without opening a browser or replacing another review. The main window stays as it was.

Keep NativeReviewNavigation's latest-selection logic for the embedded path. Do not stretch its single pending slot into a global queue. Explicit Gerrit links and category-tab actions retain their current destinations.

### Give the review window its own close policy

Pass an explicit presentation mode into review content. In a separate window, disable U and app-level review exit bindings and suppress outer Escape cancellation. Keep nested dialog, composer, and editor Escape behavior. Update shortcut help for that presentation mode.

Use the same close request for the title-bar button, normal system close shortcuts, and Close review button. The main process first prevents closure and requests the renderer's current canClose result. A request token and current window identity authorize a single close after approval. Refuse closure during writes, retain the existing discard confirmation, and cancel if the renderer cannot answer. Only an approved review close destroys that window. Do not copy the board's hide-to-tray handler or change normal app quit semantics.

Filtering app shortcuts is preferable to intercepting all keyboard input because normal system close shortcuts must work, as the user confirmed.

### Merge saved settings in one place

Add a validated partial settings update to the settings store's existing serial queue. Merge with the latest disk state inside that queue, including connection-window and tray updates that can otherwise race. Retain full-save compatibility for callers that need it, but move desktop UI field edits to patches. Keep credential checks and secret storage in their current owner.

Move the diff preference schema and validation to shared code. Add desktop get/patch preference methods backed by the serialized store. On first initialization only, accept validated values from the existing `local-review-diff-preferences` key; later renderer initialization must not overwrite the shared record. Preserve that legacy key and Diff theme for rollback. Browser mode keeps its current localStorage behavior.

Return and broadcast monotonically versioned confirmed settings/preference snapshots to every live app window. Apply only newer versions and retain newer pending local edits until their write finishes. Broadcast no failed writes. Shared updates change preferences without remounting review content or losing invalid number text being edited in a control.

Storage events alone were rejected for desktop because a read/modify/write of a whole localStorage object can lose simultaneous edits to different fields.

### Notify views after confirmed service writes

Emit connection-scoped, change-scoped invalidation events from the successful desktop mutation boundary. Cover draft save/delete, published comment deletion, review submission, reviewed files, fixes, and relevant board actions. Include affected patch sets when known. Each event has an increasing generation. Do not include credentials or unsaved composer text.

Subscribers coalesce events and fetch only affected saved data. Guard reads with connection and request generations, invalidate comment-position caches when needed, and retain each window's selected file/comparison, editor view state, and composer. Feed board updates through DashboardCache so an older dashboard search cannot undo a confirmed write. Preserve the existing separation between successful publication and a failed follow-up read. A follow-up read failure exposes retry without inviting duplicate publication. Existing polling/focus refresh remains a fallback for changes from other Gerrit clients.

A renderer-only onMutate event was rejected because existing draft paths bypass it and a renderer can close immediately after a successful service write.

### Detect stale draft edits before writing

Record the saved draft version/fingerprint when a composer starts editing. Serialize same-change desktop review mutations in the main process. Before updating or deleting an existing draft, compare its expected version with the current saved version inside that mutation queue. Include publication in the queue so a stale autosave cannot recreate a just-published draft. New drafts receive distinct identities even at the same source location.

On a mismatch or remote deletion, stop autosave for that composer, preserve its text, and display a conflict with Load saved version and Keep as new draft actions. Check the expected version on explicit saves too; notification delivery alone leaves a race. A successful refresh can update an untouched composer, but cannot overwrite dirty text. This is conflict handling, not character-by-character shared editing. A fresh read also detects many outside-client edits, but Gerrit's existing API does not supply an atomic comparison for arbitrary outside writers.

### Invalidate old connection contexts

Capture the server/account generation for each review session and operation. A connection change invalidates old reads, stops writes and autosave, preserves unsaved text, and asks the user to close and reopen the review. Keep saved settings updates independent of that old review-data context. Broadcast debug identity/read-only changes too, so a review never retains stale write permission.

## Risks / trade-offs

- More renderers increase memory use. Load one editor per window, dispose it and listeners on closure, and avoid board polling in review roots.
- Duplicate draft editing can cause data loss. Compare saved versions within the main mutation queue and retain conflicting text for explicit recovery.
- Rapid settings changes can return out of order. Merge field patches centrally and ignore snapshots older than the last accepted generation.
- New window routes can accidentally mount App. Use the registered window role at startup and on route changes; test that a review window cannot fetch the dashboard or update tray badges.
- A renderer failure during close can strand a window. Keep it open by default, allow reload, and retain normal operating-system force-close behavior without claiming unsaved recovery after a crash.
- Native behavior differs across operating systems. Exercise real Electron windows on Linux and record that platform. Check macOS and Windows close shortcuts on those platforms when available and state any missing platform verification.

## Migration plan

Add optional storage fields with defaults that keep the current viewer. Initialize shared desktop diff preferences once from validated legacy preferences. Preserve existing theme, credential, and UI-state fields during all writes.

The user can turn separate windows off without closing current reviews. Reverting the feature leaves optional fields on disk and the legacy preference key available; it must not migrate secrets or require Gerrit account changes.

## Evidence plan

For this proposal, capture a rendered report of the completed artifacts and validation result in matching light and dark views. This documents the planning outcome only.

During implementation, use the record-actions skill on an isolated Linux desktop with a labeled simulated Gerrit server. Record the same real-input workflow in both themes: enable the setting, open the same review twice, select different files, save a preference and a draft, show the other window's update, press U, dismiss a nested dialog with Escape, and close one window with a normal system shortcut. Capture conflict protection and pending-write/unsaved-close behavior as additional sequences if needed. Keep the pointer visible, hover before clicks, caption shortcuts, inspect both videos, and save paired files with -light and -dark suffixes. No proposal image is proof that the future feature works.
