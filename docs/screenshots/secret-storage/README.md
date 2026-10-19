# Secret storage verification

PR #110 includes merged credential binding #107, HTTPS #108 and browser API #109
at main `fc22f5ddad5f0d14dc9d75129cf570b8af2707ab`. This revision replaces the
explicit-removal policy with user-authorized automatic legacy cleanup.
All credentials are dummy data. Settings, profiles and servers are isolated.
No live user settings were read or changed.

## Persistence rules

Both modes use `src/main/settings-store.ts`. Electron supplies safeStorage;
browser mode has no secure persistence backend. New passwords use a trusted
OS keychain or bound process memory. Linux `basic_text`, unknown or missing
backends and encryption errors cannot persist new passwords.

During normal application startup, readable legacy plaintext or unversioned ciphertext migrates to trusted
keychain encryption if it succeeds. Otherwise, one atomic file replacement
removes password, passwordEncrypted, passwordStorageVersion and passwordIdentity.
Readable secrets can stay in memory for their ORIGINAL origin/account until
process restart. Unreadable legacy data is removed and requires re-entry.
Desktop awaits settings initialization before creating normal UI. The browser
server awaits initialization before listening or printing its startup link. No
Connection window, browser connection, save or Test action is needed. A startup
failure reports an error and exits without a readiness signal or UI setup.
The form has no removal checkbox or confirmation. It explains memory storage and
re-entry after app or browser-server restart.

Cleanup is idempotent. A failed replacement reports an error, keeps the old file
bytes and commits no new memory binding. A later successful retry can clean it.
An existing newer session password takes priority over a newly found legacy copy.
Already trusted version-1 keychain ciphertext stays on disk, including locked
copies. A retained secure A copy never becomes B's password when B receives a
new memory password. Legacy A data beside B settings is either re-encrypted with
A's binding or removed; its readable memory copy stays bound to A.

On POSIX systems, settings reads repair existing permissions to 0600. Writes use a private temporary
file, fsync and atomic replacement. Invalid JSON reports a secret-free error and
stays intact. Removing fields does not erase filesystem blocks or backups.

Environment values are snapshots. Environment passwords never enter JSON and
remain bound to their startup effective identity. Changing that identity under
GERRIT_PASSWORD requires environment changes and browser-server restart.
Partial overrides cannot adopt another identity's stored or memory password.
Invalid legacy/override URLs stay visible in status, while credential use requires
HTTPS. Save validates transport before writes; the explicit process-only loopback
HTTP test opt-in is unchanged. Identity comparison does not depend on transport
permission. The Gerrit client and redirect controls are unchanged.
The form preserves disabled identity controls, replacement requirements, and
password clearing on origin/account edits.

## Checks

```sh
npm run typecheck
node --test --test-concurrency=4 src/server/*.test.ts src/main/*.test.ts src/shared/*.test.ts src/renderer/src/*.test.ts src/renderer/src/components/*.test.ts
npm run build
node_modules/.bin/vite build --config vite.web.config.ts --outDir ../../out/browser-secret-security
```

Fresh type checks, 329 tests and both builds pass. The startup follow-up adds seven
real browser-process cases; the earlier policy revision passed 322 tests. Builds ran separately from
captures. Targeted tests cover missing/throwing/failed encryption, plaintext and
old ciphertext, unreadable legacy data, locked trusted copies, failed replacements
through all store operations, idempotence, environment snapshots, origin/account
changes, permission repair and separate Node process restarts. The service spy
asserts zero requests for B after restart with cleaned or retained A credentials.
Secure-keychain tests use a simulated AES-GCM provider, including Linux/macOS/
Windows adapter choices. They do not prove live platform keychains.

Real Electron runs in FOUR separate Linux processes with basic_text. The fixture
deliberately enables Electron's plaintext option to reproduce positive availability.
Production never does this. Plaintext cleanup retains a bound session; a new B
session saves no password and has none after restart. A separate old basic_text
ciphertext fixture bound to A beside B settings cleans on load. B has no usable
password. Changing ONLY the isolated fixture identity back to A proves the memory
copy still belongs to A. Save and window-state writes repair 0644 to 0600. The
last process has no password. See electron-result.json for actual snapshots.

The earlier connection-regression videos, captured at policy revision
`0db20f982e74f1dfa2da55d98a7fec389d1b276b`, use production browser servers, protected
API, renderer and file store. Only Gerrit responses and the trusted launch page
are simulated. Native pointer movement, two-second hovers, clicks and explained
shortcuts show loading a legacy fixture, store cleanup on read, a successful bound
memory connection, tab reload, actual server process restart, old-cookie rejection
and a new startup link with no saved password. File snapshots confirm all four
legacy fields are absent immediately on load, before Test and save.

The PRIMARY startup videos and before/after images use the current follow-up.
A test observer displays actual snapshots of the SAME isolated file, including a
dummy legacy password before startup and all four saved fields absent immediately
after startup. Its controls only launch/restart processes and observe the normal
board. They never invoke Connection, saveSettings or Test. Desktop loads the real
built main entrypoint, preload and renderer with an isolated userData path; normal
startup chooses its windows. Browser runs scripts/web.mjs and cleans before any
client request. The observer is fixture UI, not product UI.

Independent audit records capture the browser file before Server.listen and the
desktop file at the first BrowserWindow constructor, after startup awaits and
before renderer loading. They record timestamps and API/IPC requests, without
password headers or startup keys. Both show zero saveSettings calls and zero user
Connection/save/test actions. Normal boards then authenticate to the dummy Gerrit
fixture using the bound process secret. Actual new processes have no password and
send zero new Gerrit requests. Browser shows setup; desktop opens Connection for
re-entry automatically. startup-result.json contains the observed snapshots,
timestamps and audits. Desktop startup EACCES also exits 1, retains old bytes,
creates zero windows and makes no readiness claim. Browser failure is a unit
process regression with the same assertions before listen/readiness.

The CURRENT focus-recovery videos and screenshots cover a separate UI regression.
The initial load fails with actual EACCES. A native fixture-button click repairs
only that directory. Returning native focus to the existing Connection window
retries loading and populates the saved URL/account. A successful test confirms
the original bound memory secret; no obsolete checkbox exists. Native Ctrl+A types
a draft, then native focus moves away and back. The refreshed form keeps the
unsaved draft, while disk retains the original URL. recovery-result.json records
these assertions. These recovery videos include a later Test and save action;
they are not the primary startup cleanup proof.

The merged browser API workflow also runs in both themes. Its bootstrap, CSRF,
foreign-origin 403 with cookies, unchanged settings, zero attacker requests, tab
reload, second tab and fresh-profile 401 assertions remain intact. Saved JSON
must have no password. Credential replacement and real HTTPS/downgrade regressions
also run unchanged against the common store. No security assertion was weakened.

## Inspected evidence

The same data, framing and scroll position are used in both themes. Static images
show static results. Videos show continuous real input. ffprobe checks video
format/duration. Full clips are decoded at normal playback rate; timestamped
frames, pointer, captions and result states are inspected before handoff.

| Outcome | Light | Dark |
| --- | --- | --- |
| PRIMARY desktop normal startup, memory use, restart | [Video](startup-desktop-light.mp4) | [Video](startup-desktop-dark.mp4) |
| PRIMARY browser normal startup, memory use, restart | [Video](startup-browser-light.mp4) | [Video](startup-browser-dark.mp4) |
| Desktop file BEFORE startup | [Image](startup-desktop-before-light.png) | [Image](startup-desktop-before-dark.png) |
| Desktop SAME file AFTER startup, zero saves | [Image](startup-desktop-after-light.png) | [Image](startup-desktop-after-dark.png) |
| Browser file BEFORE startup | [Image](startup-browser-before-light.png) | [Image](startup-browser-before-dark.png) |
| Browser SAME file AFTER startup, zero saves | [Image](startup-browser-after-light.png) | [Image](startup-browser-after-dark.png) |
| Focus recovery and later draft preservation | [Video](cleanup-recovery-light.mp4) | [Video](cleanup-recovery-dark.mp4) |
| Recovered first load has saved URL/account | [Image](recovery-light.png) | [Image](recovery-dark.png) |
| Recovered memory connection | [Image](recovery-connected-light.png) | [Image](recovery-connected-dark.png) |
| Later focus keeps an unsaved draft | [Image](recovery-draft-light.png) | [Image](recovery-draft-dark.png) |
| Earlier Connection/reload/restart regression, not primary cleanup proof | [Video](storage-session-light.mp4) | [Video](storage-session-dark.mp4) |
| Memory-only state after cleanup on load | [Image](cleanup-light.png) | [Image](cleanup-dark.png) |
| Bound session connection | [Image](session-light.png) | [Image](session-dark.png) |
| No password after process restart | [Image](restart-light.png) | [Image](restart-dark.png) |
| Connection load failure keeps old bytes | [Image](cleanup-error-light.png) | [Image](cleanup-error-dark.png) |
| Actual JSON and file modes | [Image](verification-light.png) | [Image](verification-dark.png) |
| A cleanup and separate-process B result | [Image](binding-light.png) | [Image](binding-dark.png) |
| Credential replacement | [Image](../credential-binding/replacement-connected-light.png) | [Image](../credential-binding/replacement-connected-dark.png) |
| HTTPS connection | [Image](../transport-security/https-connected-light.png) | [Image](../transport-security/https-connected-dark.png) |
| Browser API workflow | [Video](../browser-api/browser-session-light.mp4) | [Video](../browser-api/browser-session-dark.mp4) |

[startup-result.json](startup-result.json) and [recovery-result.json](recovery-result.json)
contain current startup/recovery observations. Earlier policy artifacts are
[browser-result.json](browser-result.json), [workflow-result.json](workflow-result.json)
and [electron-result.json](electron-result.json) contain observed results.
[verification.html](verification.html) and its PNG pairs render those actual files,
not test console output. [media-inspection.json](media-inspection.json) records
video hashes, formats, durations and inspection method.

The T3 browser explicitly failed because AppArmor blocks its sandbox. Evidence
uses isolated Xvfb/Electron Chromium. Only disposable test launches use
--no-sandbox. No production flags or host protections changed. Temporary processes
are stopped after capture. Live secure Linux keychains, macOS, Windows and Windows
ACLs were not tested.

## Reproduce

Build first, then run each capture separately. The first two commands produce the
current startup and recovery evidence. Other existing captures were not rerun
solely to update a commit stamp:

```sh
xvfb-run -a -s '-screen 0 1600x1000x24' node_modules/electron/dist/electron --no-sandbox test/secret-storage-startup-ui.cjs
xvfb-run -a -s '-screen 0 1280x900x24' node_modules/electron/dist/electron --no-sandbox test/secret-storage-error-ui.cjs
xvfb-run -a -s '-screen 0 1280x900x24' node_modules/electron/dist/electron --no-sandbox test/secret-storage-ui.cjs
xvfb-run -a -s '-screen 0 1280x900x24' node_modules/electron/dist/electron --no-sandbox test/credential-binding-ui.cjs
xvfb-run -a -s '-screen 0 1280x900x24' node_modules/electron/dist/electron --no-sandbox test/transport-ui.cjs
xvfb-run -a -s '-screen 0 1280x900x24' node_modules/electron/dist/electron --no-sandbox test/browser-api-ui.cjs
```

Bundle test/secret-storage-electron.ts with Vite's esbuild, electron external.
Use one temporary GERRIT_SECRET_TEST_DIR and four separate Electron processes
with --password-store=basic. Set GERRIT_SECRET_TEST_PHASE in order to seed,
identity-restart, cipher-seed, cipher-restart. Copy electron-result.json here.
Run `node test/secret-storage-report.mjs` for file-outcome images.

## Integration

The startup/recovery follow-up additionally overlaps src/main/index.ts and
src/server/index.ts. The broader policy revision overlaps secret-storage.ts, settings-store.ts, shared types,
ConnectionWindow.tsx, settings tests, README.md, fixtures and evidence. The earlier
PR also changes settings.ts, file-settings.ts and settings-file.ts. Shared identity
helpers, transport validation, Gerrit redirects and protected API implementation
have no changes in this revision. PR-description source is
[pr-description.md](pr-description.md). This handoff is a local commit only.

## Windows CI portability follow-up

The reviewed application and startup/recovery videos remain at revision
19ddb8be19cdf7f5e8a8dea92923d539088bceda. The CI follow-up changes only tests,
fixtures and these notes. Windows CI identified POSIX mode assertions and a raw
drive path in Node --import. The helper now uses a file URL, including percent
encoding for spaces, and normalizes Windows argv separators for its audit guard.

Only POSIX mode assertions are conditional. All cleanup, identity, file-content,
restart and failure assertions still run on Windows. The real POSIX directory
denial case stays on POSIX; an additional portable simulated rename denial tests
actual process failure, no readiness/listen and unchanged old bytes on every OS.
Another real-process case imports an audit fixture from a path containing spaces.
No Windows ACL behavior is inferred from stat mode bits. Live ACL verification
remains outside this evidence.

The follow-up passed 56 targeted tests with --test-concurrency=4 and type checks
on Linux. Production files did not change, so existing application builds and
UI captures were not repeated. Native Windows results come from the new CI run.

[Light observed-file report](ci-portability-light.png) and
[dark observed-file report](ci-portability-dark.png) show the actual dummy JSON
before startup, unchanged after a simulated replacement denial, and cleaned
before listening on successful retry. Both images were inspected.
[Observed data](ci-portability-result.json) records the real Linux process/file
outcomes and labels the simulated failure. Run
`node test/secret-storage-ci-report.mjs` to regenerate this static evidence.
