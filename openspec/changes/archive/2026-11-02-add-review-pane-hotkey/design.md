# Design

## Context

The shortcut resolver supplies actions to LocalReview, which forwards editor actions to ReviewEditor. Both embedded and separate reviews use these components. A Monaco diff editor is retained in ReviewEditorSession across file changes. Monaco 0.57 has no public option to hide only the original pane. Unified mode also displays removed lines, so it does not implement this behavior.

## Goals / Non-goals

Preserve Monaco's models, diff decorations, and divider state while expanding the modified pane. Do not change the file list or saved preferences. Keep unified mode independent.

## Decisions

Add a toggleOriginal shortcut and keep its state in the editor session. Use a small adapter around Monaco's existing sash layout calculation. When hidden, return a zero original width and disable sash input. When restored, use the existing calculation and retained sash ratio. Read the original calculation first so Monaco keeps its normal layout dependencies. This avoids replacing models or creating a second editor.

Disable wrapping in the hidden original pane so it cannot add blank alignment rows. Restore its wrapping mode when shown, and reapply the hidden layout after preference changes. Hide the original header and exclude the original editor from focus and accessibility while hidden. Move focus to the modified pane when hiding from the original. Restore the original before explicit original-pane navigation or comment reveal. Clear hidden mode when changing diff mode. Shift+A is inactive in unified mode.

## Risks / Trade-offs

The adapter uses a private Monaco layout method. Monaco is pinned to 0.57.0. Cover hide, restore, width, resize, file switching, split retention, and keyboard guards with packaged Electron checks. Recheck the adapter on Monaco upgrades.

## Evidence plan

Use an isolated Xvfb desktop and the built Electron renderer with the existing local review fixture preload. Record real X11 keyboard and pointer input with FFmpeg, captions, visible pointer, and two-second hover pauses. Capture the same hide, navigate, and restore workflow in both themes. Inspect exported videos and paired frames. State that Gerrit data is simulated and the platform is Linux.
