# Proposal previews

`proposal-light.png` and `proposal-dark.png` are static mockups with simulated review data. They show the intended layout before and after internal text scrolling. They do not prove that scrolling works in the application. No application code was changed.

Both captures use a 728 by 805 viewport, identical text, and identical field scroll positions of 0 and 120 pixels. The code at line 42, field dimensions, Save and Cancel controls, and surrounding layout have matching positions. Both images were inspected for readable text, visible scrollbar positions, and matching layout. Neither has horizontal page overflow.

The captures were made on Linux with Electron 44.2.0 under an isolated Xvfb display. `capture-results.json` records the actual runtime version and geometry. The HTML source is `proposal.html`. `capture.cjs` reproduces the screenshots when run with an available Electron binary and this directory as its last argument.

T3 browser open and HTML preview could not capture the page. Both returned this error:

> This host blocks the sandbox T3's browser runs in (AppArmor on Ubuntu 23.10+).

Local Electron captured the static files with `--no-sandbox`. No host settings were changed. Strict OpenSpec validation passed and all four planning artifacts are complete. Application scrolling, input behavior, and physical trackpad compatibility remain implementation verification tasks in `../tasks.md`.
