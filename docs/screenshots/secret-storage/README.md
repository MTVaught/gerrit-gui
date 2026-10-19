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

On load, readable legacy plaintext or unversioned ciphertext migrates to trusted
keychain encryption if it succeeds. Otherwise, one atomic file replacement
removes password, passwordEncrypted, passwordStorageVersion and passwordIdentity.
Readable secrets can stay in memory for their ORIGINAL origin/account until
process restart. Unreadable legacy data is removed and requires re-entry.
The form has no removal checkbox or confirmation. It explains memory storage and
re-entry after app or browser-server restart.

Cleanup is idempotent. A failed replacement reports an error, keeps the old file
bytes and commits no new memory binding. A later successful retry can clean it.
An existing newer session password takes priority over a newly found legacy copy.
Already trusted version-1 keychain ciphertext stays on disk, including locked
copies. A retained secure A copy never becomes B's password when B receives a
new memory password. Legacy A data beside B settings is either re-encrypted with
A's binding or removed; its readable memory copy stays bound to A.

Settings reads repair existing permissions to 0600. Writes use a private temporary
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

Fresh type checks, 322 tests and both builds pass. Builds ran separately from
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

The paired continuous native videos use production browser servers, protected
API, renderer and file store. Only Gerrit responses and the trusted launch page
are simulated. Native pointer movement, two-second hovers, clicks and explained
shortcuts show loading a legacy fixture, automatic cleanup, a successful bound
memory connection, tab reload, actual server process restart, old-cookie rejection
and a new startup link with no saved password. File snapshots confirm all four
legacy fields are absent immediately on load, before Test and save.

A paired native desktop screenshot captures an actual EACCES replacement failure.
The isolated directory is temporarily unwritable. The UI reports failure, file
bytes remain unchanged, then a retry after permission repair cleans successfully.

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
| Automatic cleanup, reload and process restart | [Video](storage-session-light.mp4) | [Video](storage-session-dark.mp4) |
| Memory-only state after cleanup on load | [Image](cleanup-light.png) | [Image](cleanup-dark.png) |
| Bound session connection | [Image](session-light.png) | [Image](session-dark.png) |
| No password after process restart | [Image](restart-light.png) | [Image](restart-dark.png) |
| Failed cleanup keeps old bytes | [Image](cleanup-error-light.png) | [Image](cleanup-error-dark.png) |
| Actual JSON and file modes | [Image](verification-light.png) | [Image](verification-dark.png) |
| A cleanup and separate-process B result | [Image](binding-light.png) | [Image](binding-dark.png) |
| Credential replacement | [Image](../credential-binding/replacement-connected-light.png) | [Image](../credential-binding/replacement-connected-dark.png) |
| HTTPS connection | [Image](../transport-security/https-connected-light.png) | [Image](../transport-security/https-connected-dark.png) |
| Browser API workflow | [Video](../browser-api/browser-session-light.mp4) | [Video](../browser-api/browser-session-dark.mp4) |

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

Build first, then run each capture separately:

```sh
xvfb-run -a -s '-screen 0 1280x900x24' node_modules/electron/dist/electron --no-sandbox test/secret-storage-ui.cjs
xvfb-run -a -s '-screen 0 1280x900x24' node_modules/electron/dist/electron --no-sandbox test/secret-storage-error-ui.cjs
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

This revision overlaps secret-storage.ts, settings-store.ts, shared types,
ConnectionWindow.tsx, settings tests, README.md, fixtures and evidence. The earlier
PR also changes settings.ts, file-settings.ts and settings-file.ts. Shared identity
helpers, transport validation, Gerrit redirects and protected API implementation
have no changes in this revision. PR-description source is
[pr-description.md](pr-description.md). This handoff is a local commit only.
