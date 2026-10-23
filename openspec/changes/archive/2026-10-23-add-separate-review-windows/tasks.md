# Tasks

## 1. Shared settings and preference persistence

- [x] 1.1 Add the optional `separateReviewWindows` field and validated partial settings updates in shared types, service/API, preload, and settings-store code. Merge patches inside the existing store queue. Verify default-off behavior, retained values, concurrent different-field edits, credential checks, and preservation of UI state with settings-store tests.
- [x] 1.2 Move diff preference validation to shared code and add serialized desktop preference get/patch storage. Initialize once from valid legacy localStorage values. Verify migration, restart persistence, defaults, and rejection of stale reinitialization with preference/store tests; retain browser-mode localStorage tests.
- [x] 1.3 Return and broadcast versioned confirmed settings/preference snapshots to all desktop windows. Update desktop setting writers, including tray and connection paths, to avoid stale whole-object saves. Verify two simultaneous writers, out-of-order responses, failed writes, and unrelated-field preservation with focused tests.
- [x] 1.4 Connect existing settings and diff preference controls to the shared desktop state without remounting reviews. Add the autosave checkbox under Settings > Window with its in-app-review dependency and desktop-only scope. Verify control behavior, pending/invalid input retention, and shared theme/font changes in a renderer fixture; document the setting and shared preference behavior in the project usage documentation.

## 2. Review-only window lifecycle and routing

- [x] 2.1 Add a main-process review-window registry with unique instance IDs, assigned review context, startup readiness, and cleanup. Use existing sandbox and RendererBoundary settings. Verify duplicate change IDs create different BrowserWindows and destroyed windows release registry entries and listeners.
- [x] 2.2 Add typed window-context and review-open APIs. Enforce the registered review change and window role for IPC. Verify wrong-change requests, board navigation, compact-mode changes, badge updates, and attempts to open another review from a review window are refused with boundary tests.
- [x] 2.3 Extract reusable review content and add a ReviewWindow renderer root with settings/theme providers. Keep App and Board out of that root. Verify reload restores the assigned change, invalid context renders an error, hash edits cannot mount the board, and review windows issue no dashboard fetches or tray badge writes.
- [x] 2.4 Route board and native menu review opens through the configured destination. Keep embedded latest-selection delivery and use independent delivery for separate windows. Extend native navigation tests for duplicate opens, concurrent startup, reversed metadata completion, hidden main windows, Settings, compact mode, metadata failures, and explicit web/category actions.
- [x] 2.5 Add separate-window shortcut handling and the guarded native-close handshake. Verify U and outer Escape leave the window open, nested Escape still dismisses controls, system close and Close review destroy only their window, pending writes block closure, and canceling discard retains text. Update shortcut help and usage documentation to match the tested behavior.

## 3. Shared review data and draft conflicts

- [x] 3.1 Emit connection/change-scoped invalidation events after successful desktop service mutations, including draft paths that bypass onMutate. Verify every supported mutation notifies matching views, failed writes do not notify, and destroyed or unrelated windows do not receive stale results.
- [x] 3.2 Subscribe review windows, embedded reviews, and DashboardCache to affected-data refreshes with generation checks and event coalescing. Verify saved drafts, comments, votes, reviewed files, reviewer/attention changes, and fixes update other views while file/comparison/scroll/composer state stays local; cover stale reads and successful publication followed by refresh failure.
- [x] 3.3 Add saved-draft version checks inside the same-change mutation queue for updates, deletes, and publication ordering. Verify two windows editing the same draft cannot silently overwrite one another, late autosave cannot recreate a published draft, and separate new drafts at one location keep distinct IDs.
- [x] 3.4 Add conflict feedback that pauses autosave and offers Load saved version or Keep as new draft. Verify both recovery actions, deleted/published draft handling, explicit stale saves, and retention of unsaved local text in renderer tests. Document the conflict workflow and the limit on coordination with outside Gerrit clients.
- [x] 3.5 Broadcast connection and debug read-only context changes. Stop stale reads and writes while preserving local text in old review sessions. Verify account/server changes and delayed responses cannot reuse old cached data or permissions, and a close/reopen uses the current context.

## 4. Integrated checks and visual evidence

- [x] 4.1 Extend the Electron integration fixtures with a labeled simulated Gerrit service and multiple real review windows. Run the opt-in/default routing, duplicate review independence, shared settings/data, draft-conflict, close-guard, and reload workflows. Verify the fixtures cover both the embedded viewer and separate-window mode.
- [x] 4.2 Run `pnpm typecheck`, `pnpm test`, `pnpm build`, and the affected Electron integration checks. Verify no failures remain and record any platform checks that could not run.
- [x] 4.3 Use the record-actions skill to capture comparable real-input Linux workflows in light and dark mode. Demonstrate the setting, two windows for the same review, independent navigation, shared preference/draft updates, U, nested Escape, and normal system close. Add sequences for conflict and close protection as needed. Inspect both recordings, use -light/-dark filenames, state that Gerrit data is simulated, and link both artifacts in the implementation report.
