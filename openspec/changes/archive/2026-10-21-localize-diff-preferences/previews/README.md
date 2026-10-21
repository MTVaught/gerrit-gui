# Proposal previews

These are static mockups of the proposed Diff Preferences dialog, captured on Linux with Electron 44.2.0 and simulated values. They demonstrate the planned layout and copy. They do not demonstrate application behavior or completed implementation.

- `proposal-light.png` and `proposal-dark.png` use the same 728 by 810 viewport, values, control positions, and scroll position.
- Both show the 11 existing preference fields, automatic application copy, and a single Close button.
- `proposal.html` is the self-contained source for the mockups.
- `capture-results.json` records the viewport, dialog bounds, field count, footer button, and overflow checks for both captures. A separate 360-pixel layout check found no horizontal overflow.

Both screenshots were inspected for readable labels, controls, helper text, and matching layout.

T3 preview and HTML preview capture returned this error:

> This host blocks the sandbox T3's browser runs in (AppArmor on Ubuntu 23.10+).

The screenshots were captured with local Electron under an isolated Xvfb display. No host configuration was changed. Strict OpenSpec validation passed. Runtime tests and real-input video evidence are implementation tasks in `../tasks.md`.
