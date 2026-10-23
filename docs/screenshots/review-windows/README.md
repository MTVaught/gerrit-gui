# Separate review window evidence

Captured on Linux X11 with Electron 44.2.0, Xvfb, Openbox, and real xdotool
pointer, click, typing, and keyboard input. Gerrit responses are simulated by
`test/fixtures/review-windows-server.cjs`. The app uses its production main
process, settings store, service, preload, renderer, and close handlers.

- [Light workflow](review-windows-light.mp4)
- [Dark workflow](review-windows-dark.mp4)
- [Light setting](review-window-setting-light.png)
- [Dark setting](review-window-setting-dark.png)

Both videos use the same 1920 by 1080 desktop, review data, starting state,
window positions, and action sequence. Each is 164.8 seconds, H.264, yuv420p.
The setting screenshots use the same view, data, and scroll position. Both
themes were inspected for readable text, pointer visibility, hover pauses,
captions, conflict controls, the discard prompt, and the final close result.
The caption strip is rendered after capture. The captured actions and their
timing are unchanged.

The sequence enables the setting, opens the same review twice, changes one
window's file, shares a font preference and saved draft, recovers from a draft
conflict, blocks closure during a simulated slow save, cancels a native discard
prompt, leaves a separate window open after U, dismisses preferences with
Escape, and closes only the focused review with Alt+F4.

## Checks

- `pnpm test`: 370 tests passed.
- `pnpm typecheck`: passed.
- `pnpm build`: passed.
- `test/review-windows-ui.cjs`: passed in light and dark mode. This exercises
  real windows and IPC, including stale writes, both conflict choices,
  publication and board refresh, refresh failure and retry, metadata errors,
  reload, the default embedded viewer, and connection changes.
- `test/native-review-ui.cjs`: existing native navigation regression passed.
- `test/review-comment-keyboard-ui.cjs`: existing comment keyboard checks
  passed in light and dark mode.
- `openspec validate add-separate-review-windows --strict`: passed.

Native Windows and macOS window behavior was not tested. Linux proof covers
Alt+F4. Normal platform close shortcuts use the same Electron close handler.

## Repeat the capture

Build first. Run `test/record-review-windows.cjs` through the installed Electron
binary in an isolated D-Bus session and a 1920 by 1080 Xvfb display. Set
`REVIEW_WINDOWS_THEME` to `light` or `dark`. Give D-Bus its own `XDG_CONFIG_HOME`
and `XDG_CACHE_HOME` directories. For paired captures, use the same available
loopback port through `REVIEW_WINDOWS_PORT`. The script creates isolated app
data, starts and stops the simulated server and Openbox, and saves videos and
setting screenshots here. Each action moves the pointer and waits about two
seconds before clicking. Timing records are in `recording-light.json` and
`recording-dark.json`.

The vendor Electron sandbox helper was enabled for this checkout with root
ownership and mode 4755. Kernel and AppArmor protections stayed enabled. The
host inventory records this setup in
`/home/dev/fleet/hosts/framework-pve/guests/t3-dev/README.md`.

## Archive verification

- [Light archive report](archive-light.png)
- [Dark archive report](archive-dark.png)
- [Verification data](archive-verification.json)
- [Report source](archive-report.html)

The reports show the actual archive at
`openspec/changes/archive/2026-10-23-add-separate-review-windows`.
All 11 archived files match their pre-move hashes, including `.openspec.yaml`.
All 17 tasks are complete. All three deltas match the main specs. Strict
validation passed for all 15 main specs and the archived change. Existing
Purpose sections and unrelated requirements were preserved.

Both reports were captured on Linux with Electron's Chromium renderer at
1000 by 900 pixels. They use the same repository data and scroll position.
Both images were inspected for readability and clipping. No archive data is
simulated. T3 preview was blocked by host AppArmor settings, and standalone
Chromium capture timed out. Electron capture used the installed sandbox
helper and did not require host security changes.
