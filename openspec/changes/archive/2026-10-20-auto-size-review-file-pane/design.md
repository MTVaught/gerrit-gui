# Design

## Context

See `proposal.md` for the problem. `ReviewFileList` owns a session-only numeric width and a pointer and keyboard separator. The review body uses flex layout. The file list scrolls vertically, and file rows use a three-column grid. Existing Electron fixtures exercise the real renderer without a Gerrit connection.

## Goals / Non-Goals

Use browser layout to measure rendered text, including the active font and row decorations. Keep manual widths local to the open review. Do not add a saved preference or change native window constraints.

## Decisions

- Use CSS intrinsic `max-content` width until the user resizes the pane. It responds to loaded files, filters, and fonts without estimating character widths. A larger fixed default would fail on longer names. Canvas measurements would duplicate layout rules for controls and counts.
- Cap width at 50% of the review body. Use a 140 px minimum where space permits. Wrap folder paths and file names with `overflow-wrap: anywhere` and normal whitespace. Allow file buttons to grow vertically. Horizontal scrolling would still hide part of a name, and an unlimited pane could push the diff outside the window.
- Keep manual width as an optional numeric override. Observe the rendered pane and its parent with `ResizeObserver` to report the actual width and the current resize range. Start drags from the measured width. Clamp keyboard and pointer changes to the same range as CSS. Disconnect observers when the review closes.
- Use existing theme variables. No theme-specific sizing rules are needed.

## Risks / Trade-offs

- Very long labels need taller rows. Keep the full text selectable through the existing file button and preserve review controls and counts in separate columns.
- Wide panes reduce diff width. The half-width limit keeps the diff visible. Test both large and narrow windows and window resizing after a manual change.
- Intrinsic sizing can interact with the grid and scroll container. Verify real element bounds, wrapping, and absence of horizontal overflow in Electron.

## Verification plan

Extend the review fixture with representative long folder paths, file names, and an unbroken name. Add an Electron UI check for automatic sizing above 360 px, dynamic data and window sizes, pointer and keyboard resizing, filtering, file selection, and reopen behavior. Run type checks and the existing review UI checks.

Capture matching light and dark screenshots of the initial wide pane and of labels that wrap at a smaller width. Record the same resize workflow in both themes on an isolated Linux desktop, using real pointer input with hover pauses and captions. Inspect the exported artifacts. Fixture data is simulated; layout, navigation, and resizing use the built renderer. The T3 preview is blocked by host AppArmor, so use the documented Electron capture path.
