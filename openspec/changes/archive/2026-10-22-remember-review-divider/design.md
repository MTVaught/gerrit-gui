# Design

## Context

`LocalReview` mounts a keyed `ReviewEditor` for each loaded file. Loading another file unmounts the current editor. `ReviewEditor` saves per-file Monaco view state, but that state does not contain the divider ratio. Monaco keeps the divider ratio in its diff editor instance.

## Goals / Non-Goals

Keep the editor instance alive for the review window while retaining the current file loading, model disposal, cursor restoration, and scroll restoration behavior. Do not persist review layout across closed windows or app restarts.

## Decisions

- Own one diff editor session in `LocalReview`. Pass it to each `ReviewEditor` mount. Reattach its container when another file opens. This retains Monaco's divider state through loading gaps and cached-file visits.
- Keep model creation, file view-state restoration, actions, and subscriptions scoped to each `ReviewEditor` mount. Create an explicit diff view model for each file. Save the file state, detach the models, and dispose the view model before disposing its text models and subscriptions.
- Dispose the shared editor after the review window closes. Defer final disposal to a microtask so child cleanup can save file state first.
- Reset the per-file diff layout mode to side by side on each mount, as before. Keep the divider ratio within the shared instance.

Saving a ratio and using `splitViewDefaultRatio` on each new instance was considered. Monaco clamps that option to 0.1 through 0.9, although the actual divider can move farther. Keeping the instance preserves the full drag range without private APIs or dependency changes.

## Risks / Trade-offs

- Reusing an editor can retain file-specific listeners or zones. Dispose subscriptions and models on every file exit, then run the existing comment, navigation, and wrapping UI checks.
- A detached editor can observe a temporary zero size. Reattach it before setting the next models and verify repeated navigation and window resizing.
- The session lives until the review closes. Dispose it after child cleanup and verify closing and reopening starts a fresh editor.

## Verification and evidence

Use the built Linux Electron renderer with the existing simulated Gerrit preload. Drive the divider and file controls with X11 pointer input. Check new files, cached files, a second adjustment, extreme positions, comparison changes, window resizing, and file scroll restoration. Record the same drag-and-switch sequence in light and dark mode with a visible pointer, two-second hover pauses, and short captions. Inspect both exported videos before sharing them.
