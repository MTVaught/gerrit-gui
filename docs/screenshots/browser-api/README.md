# Browser API session checks

The audit was confirmed before the fix with isolated settings and dummy
credentials. An unauthenticated foreign-Origin text/plain request changed the
Gerrit URL. A second request sent the saved dummy password there. Both returned
HTTP 200.

All 256 unit tests, type checks, and the browser build passed after the fix.
The tests use isolated temporary settings and dummy credentials. They cover
session authentication, exact Origin and Host checks, proxy header spoofing,
duplicate headers, JSON type, syntax, array envelope and size checks, one-use
bootstrap handling, HTTPS cookie flags, and session rejection after restart.

## Verified light-mode outcomes

These captures use the real Vite server, API, file settings store, and browser
renderer on Linux through Electron Chromium without an application preload.
Gerrit is a local HTTP fixture with a synthetic account and dummy password.

- connected-light.png shows a successful connection after real pointer and
  keyboard input filled the form and clicked Test and save.
- foreign-origin-light.png shows a separate localhost website after a real
  click sent both audited text/plain requests with browser credentials
  included. Chromium observed HTTP 403 for both requests. The harness added
  the observed statuses to the fixture page. It also checked that the settings
  file and Gerrit request count did not change.
- unauthenticated-light.png shows a fresh browser profile that could not enter
  the app. Unit tests independently confirm HTTP 401 without a session.

The completed light-mode run also passed reload and second connection-tab
checks in the authorized session. No session value is saved in these files.

## Visual verification is incomplete

T3 preview could not start because the host AppArmor policy blocks its browser
sandbox. The repository Electron/Xvfb capture path was used instead. The first
run passed all light-mode checks but timed out during the dark-mode sequence.
Later paired recording attempts stalled under heavy host load. The last attempt
stopped after starting light mode, before it reached an input action. A separate
HTTP probe still got frontend HTTP 200 and unauthenticated API HTTP 401.

Only this task's stalled processes were stopped. No host policy was changed.
Incomplete recordings were removed. There is no verified dark-mode artifact or
complete video pair. The three screenshots were inspected and support the
stated light-mode outcomes only.

Run the reusable capture script when host load allows:

    xvfb-run -a -s '-screen 0 1280x900x24' node_modules/.bin/electron --no-sandbox test/browser-api-ui.cjs

The sandbox flag is limited to the Xvfb test harness. The script checks the
actual cookie flags and unauthorized response status. It records pointer
movement and hover pauses, captions Ctrl+A before field replacement, and uses
the same data and framing in each mode. A successful run also writes a
verification.json file without session values.

Safari, Firefox, and remote forwarding were not tested. Forwarding must
preserve the exact configured Host and Origin. Local services on the browser
hostname share cookie scope and remain trusted, as do scripts at the approved
origin. Credential retention, method argument schemas, remote transport, and
credential storage are separate work.
