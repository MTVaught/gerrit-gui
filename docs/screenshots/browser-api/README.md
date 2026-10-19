# Browser API session checks

The original audit was confirmed before the fix with isolated settings and
dummy credentials. An unauthenticated foreign-Origin `text/plain` request
changed the Gerrit URL, and a second request sent the saved dummy password
there. Both returned HTTP 200. This is a historical baseline. The current
combined code also has the merged origin/account binding and HTTPS protections.

## Combined implementation

This branch is based on `f6401536cdf42225746b29f397bf024f828b8b3d`, which includes
credential-binding PR #107 and HTTPS PR #108. Their implementation files,
including the browser environment identity snapshot, were unchanged in #109.
The later password-storage integration moves persistence into a shared store
and preserves those policies. Its current rerun uses memory-only browser
passwords and asserts that the saved JSON has no password. All authentication,
Origin, Host, cookie, and network-dispatch assertions remain intact.

The browser API now requires a process session and exact configured Host and
Origin values. It rejects absent, foreign, null, duplicate, and mismatched
headers before service dispatch. Proxy forwarding headers cannot establish
trust. The Vite proxy preserves Host and Origin, binds to loopback, and has
CORS disabled. Only POST requests with a UTF-8 JSON argument array of at most
1 MiB can reach a service method. Invalid syntax, encoding and oversized
bodies fail before dispatch. Inherited object methods cannot be called.

The terminal prints a random one-use link. The browser removes its fragment
key from the URL before making API calls. A successful exchange creates a
random HttpOnly, SameSite=Strict session cookie, with Secure for an HTTPS
browser origin. The session ends when the API process stops. It cannot be
recreated by fetching an unauthenticated endpoint. Reloads and the app's
connection tabs use the existing session.

## Paired workflow evidence

All artifacts below come from the current combined code. Both modes start
with empty isolated settings, a new API process, and a fresh browser profile.
The same fixed ports, fixture account, framing, input sequence, scroll position,
and pauses are used in each mode.

| Outcome | Light | Dark |
| --- | --- | --- |
| Full workflow | [Video](browser-session-light.mp4) | [Video](browser-session-dark.mp4) |
| Authorized connection | [Screenshot](connected-light.png) | [Screenshot](connected-dark.png) |
| Foreign-origin requests rejected | [Screenshot](foreign-origin-light.png) | [Screenshot](foreign-origin-dark.png) |
| Unauthenticated profile blocked | [Screenshot](unauthenticated-light.png) | [Screenshot](unauthenticated-dark.png) |

Each continuous video shows these actions and results:

1. A native click opens the one-use link from a trusted local launch fixture
   that represents the terminal link. The real renderer exchanges the key,
   removes it from the URL, and opens the board. Chromium observes HTTP 200
   for the session exchange. The fixture does not create a session itself.
2. A native click on the app's setup button opens the real connection tab.
   The test checks that it uses the same browser session. Native X11 pointer,
   clicks and keyboard input fill the form with dummy credentials, then click
   Test and save. The real API and file store save them, and the Gerrit fixture
   confirms the synthetic account. Save and test both return HTTP 200.
3. The same browser visits a website on a different localhost port. A native
   click sends actual `text/plain` saveSettings and testConnection requests.
   Both include the existing session cookie, and both return HTTP 403. This
   shows that the Origin check works even with a valid session. The mutation
   includes an explicit replacement dummy password, so rejection does not
   depend on the merged password-reuse guard.
4. The harness checks the settings file byte for byte, the Gerrit call count,
   and a separate attacker server. The file is unchanged. Neither server gets
   a request during the attack. The fixture page displays the HTTP statuses
   observed through Chromium and these independently checked results. Website
   JavaScript itself cannot read the rejected cross-origin responses.
5. The browser reopens the saved connection and uses native Ctrl+R to reload.
   The approved server URL remains intact. The original board regains focus,
   reads the settings, and loads an empty synthetic dashboard. Native clicks
   on Settings and Connection open another real authorized connection tab.
6. A fresh browser profile opens the same application URL without the startup
   key. The real API returns HTTP 401, and the renderer shows the session
   requirement. The video pauses on that result for at least 3.5 seconds.

Captions explain actions before they occur, including Ctrl+A and Ctrl+R.
The pointer moves for about one second and rests over each target for about
two seconds before clicking. The captions and navigation links are test
annotations outside the app controls. They do not invoke application handlers.
The videos contain no cuts or speed changes. Inputs use X11 without
DOM-dispatched events or direct handler calls. The launch key and session
cookie values are not shown or saved in the artifacts.

Both videos and all six screenshots were inspected for readability, framing,
layout, captions, pointer movement, hover pauses, and result visibility. Full
video decoding and normal-rate decoding passed without errors. The exports
are H.264, yuv420p, 1280 by 900 pixels, 20 fps, with fast-start metadata. Light
lasts 57.95 seconds and dark lasts 57.90 seconds.

[verification.json](verification.json) records the observed API statuses and
assertion outcomes for both modes without storing session values.

## Fixtures and platform limits

The real Vite server, browser API, settings store, and renderer run on Linux
through Electron Chromium without an application preload. Only the Gerrit
account and empty search responses, the trusted launch page, and the attacking
website are fixtures. Settings, browser profiles, and caches use a temporary
directory. Dummy credentials are used throughout.

The child API process explicitly sets `GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP=1` for
HTTP fixtures on loopback IPs `127.0.0.1:19676` and `127.0.0.1:19677`. This does
not permit remote HTTP and is not a renderer argument or saved setting. Unit
fixtures use HTTPS URLs with mocked Gerrit transport. They also check that
remote HTTP and identity changes without replacement passwords still fail
through an authorized browser session before transport. The merged environment
identity snapshot tests pass without modifying their implementation.

T3 preview still returns this host limitation:

> Preview automation open failed: This host blocks the sandbox T3's browser runs in (AppArmor on Ubuntu 23.10+).

The documented Electron/Xvfb fallback completed successfully. The `--no-sandbox`
flag applies to this test launcher only. No host policy was changed. This proof
covers Linux Chromium, not Safari, Firefox, macOS, Windows, or a remote forwarding
provider. A forwarded browser URL must match WEB_ORIGIN exactly and preserve
Host and Origin. Local services on the browser hostname share cookie scope and
remain trusted, as do scripts at the approved origin. Browser local-network
restrictions are not needed for the demonstrated rejections.

All temporary servers, recorders, windows, and the test display were stopped.
The completed paired artifacts replace the earlier incomplete light-only set.
There are no remaining capture blockers for this Linux workflow.

## Validation and reproduction

Checks ran in sequence with one heavy command at a time:

- Relevant security tests, 25 passed.
- Full unit suite with `--test-concurrency=1`, 275 passed.
- `pnpm typecheck`, passed.
- `pnpm build`, passed.
- `pnpm exec vite build --config vite.web.config.ts --outDir ../../out/browser-security-check`, passed. The existing large-chunk warning remains.
- The real native-input capture below, both modes passed.
- Both complete MP4 files decoded without errors. Encoding and matched duration
  were checked with ffprobe. The screenshots and video frames were inspected.

Run the captures from this worktree when the five fixture ports are free:

```sh
xvfb-run -a -s '-screen 0 1280x900x24' node_modules/.bin/electron --no-sandbox test/browser-api-ui.cjs
```

The harness publishes artifacts only after both modes pass. On failure, it
stops its own processes and removes its temporary settings and partial captures.
