# Electron renderer boundary

Both app windows use `src/main/renderer-boundary.ts`.

- Every invoke channel and the send-only badge channel require a registered,
  live `webContents`, its exact current main frame, the expected origin, and
  the pinned renderer document URL. Hash routes are allowed. Other windows,
  child frames, detached frames, and other documents have no IPC authority.
- Navigation and redirects must stay on the pinned document. Child-frame
  navigation and child initiators targeting the main frame are denied.
  Reloads and hash routes remain available. Webview support is explicitly off,
  with a second check that cancels attachment events.
- Both window-open handlers deny every popup, including external dispatch.
  Electron's popup callback has no reliable initiating-frame identity. A
  trusted top-level window or a matching referrer cannot authorize a child
  frame's popup. Existing external app links use the named IPC methods instead.
- Web, change, release-note, and tray links use one parser before OS dispatch.
  It accepts absolute HTTP and HTTPS URLs. It rejects other schemes, user
  credentials, malformed URLs, control characters, and backslashes.
- The existing Slack path builds `slack://channel` only in the main process
  from a validated web URL and stored workspace mapping. Renderer-supplied
  Slack protocol URLs are denied. Failed Slack dispatch falls back to the web
  URL.
- Packaged builds load the bundled document. Source builds can use the exact
  `ELECTRON_RENDERER_URL` entry. Other paths on that origin are untrusted.
- The production preload exposes its named API only in the main frame.
  Context isolation and the renderer sandbox remain on. Node integration in
  the renderer and its child frames remains off.

This change retains the merged startup failure handler, automatic legacy
secret cleanup, secure-or-memory storage, origin/account binding, HTTPS and
redirect policy, and browser sessions. It changes no service, settings-store,
transport, or browser-server code.

Script running inside the trusted app document still has the named API's
existing authority. These checks do not validate every IPC argument.

## Checks

```sh
node --test --test-concurrency=4 src/server/*.test.ts src/main/*.test.ts src/shared/*.test.ts src/renderer/src/*.test.ts src/renderer/src/components/*.test.ts
pnpm typecheck
pnpm build
```

Build first. Then run native tests one at a time. They need Linux, a working
Electron sandbox, Xvfb, Openbox, xdotool, FFmpeg, and `dbus-run-session`.

```sh
test/run-electron-boundary-ui.sh
BOUNDARY_DEV_RENDERER=1 test/run-electron-boundary-ui.sh
```

The harness starts the built production main process and preload. File mode
loads the bundled renderer. Source mode starts a real Vite server with React
and loads the source entry through `ELECTRON_RENDERER_URL`.

The launcher sets temporary desktop paths before D-Bus starts. Each run uses
a temporary profile, isolated desktop configuration, and dummy
accounts. Only a loopback Gerrit fixture is used. The harness explicitly sets
`GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP=1`; production transport checks stay intact.
It seeds an old secret bound to a different account. Startup must remove it
without sending it to Gerrit. Real pointer and keyboard input supplies the
replacement. Only the intended account and that replacement may reach the
real service's fixture requests. With no trusted keychain, the replacement
must remain absent from JSON and available only in the running process.

All 42 invoke channels receive real IPC from an unregistered window at the
exact app URL and from its child frame. The adversarial window has its own
session and a test-only preload that can send arbitrary IPC. Send-only badge
attempts include a distinct count marker; it must never reach the native badge
API. The production child frame must have no API bridge. Its real popup and
navigation requests are denied. Frame detachment is observed after removal.
Unit tests also cover stale frame identities, disposed getters, origin changes,
and navigation initiators targeting the pinned document.

The harness forces a registered window onto an untrusted remote document and
an untrusted sibling on the same origin. This main-process operation deliberately
bypasses renderer navigation prevention. IPC must still reject the current
document. Server redirects are blocked independently. Web links, patch-set
links, release notes, main-generated Slack links and fallback, reloads, hash
routes, and Connection must still work.

## Native evidence

The default artifact folder is `docs/screenshots/electron-boundary/`, outside
ignored build output. `BOUNDARY_ARTIFACTS` can select another folder. For a
matched pair, keep the fixture port and framing the same:

```sh
BOUNDARY_RECORD=1 BOUNDARY_THEME=light BOUNDARY_PORT=19261 test/run-electron-boundary-ui.sh
BOUNDARY_RECORD=1 BOUNDARY_THEME=dark BOUNDARY_PORT=19261 test/run-electron-boundary-ui.sh
```

For the source pair, add `BOUNDARY_DEV_RENDERER=1 BOUNDARY_VITE_PORT=19262` to
each command. Filenames include `file` or `vite`, then `-light` or `-dark`.
JSON reports list every rejected invoke channel and the checked outcomes.

Videos capture actual X11 pointer and keyboard input continuously. They include
smooth pointer movement, two-second hovers, action captions and final holds.
The security panel is an injected test fixture, not product UI. Its external
link button calls the production named API. OS dispatch is intercepted, so no
real browser, Slack app, or hostile protocol handler starts.

Gerrit data, hostile documents and adversarial scripts are fixture data.
Scripted hostile `window.open` and location changes generate real Electron
popup/navigation events. Rogue and child-frame probes generate real IPC.
The defensive `will-attach-webview` event is simulated, and the native window
preferences also confirm that webview support is off. These simulations are
separate from the recorded native click and typing sequence.

The tested platform is Linux with Electron 44.2.0 and the sandbox enabled.
No host setting or production sandbox flag is changed. These runs do not test
native Windows/macOS behavior, a signed packaged distribution, or real external
OS protocol handlers.

## Recorded result, 2026-10-19

The branch is based on `72f88e8b8a9ab37586486779cd20467350f27168`.
All 340 tests pass with four test workers. Type checks and the full build pass.
Each of the four native runs passes all 42 invoke-channel probes for both the
rogue window and its child, plus the navigation, link and account checks above.
The videos were decoded at normal playback rate and inspected with synchronized
frames. Static captures were inspected at full size for layout and readability.

- Bundled file entry: [light video](screenshots/electron-boundary/electron-boundary-file-light.mp4), [dark video](screenshots/electron-boundary/electron-boundary-file-dark.mp4).
- Vite source entry: [light video](screenshots/electron-boundary/electron-boundary-vite-light.mp4), [dark video](screenshots/electron-boundary/electron-boundary-vite-dark.mp4).
- Connection/account status, file entry: [light](screenshots/electron-boundary/connection-success-file-light.png), [dark](screenshots/electron-boundary/connection-success-file-dark.png).
- Connection/account status, source entry: [light](screenshots/electron-boundary/connection-success-vite-light.png), [dark](screenshots/electron-boundary/connection-success-vite-dark.png).

All videos use 1280 by 900 framing, H.264, `yuv420p`, 25 frames per second,
and fast-start metadata. Their duration is about 50 seconds. Both entry modes
use the same dummy account and Gerrit fixture port in both themes. Expected
`Untrusted IPC sender` errors in the native logs come from rejected probes.
