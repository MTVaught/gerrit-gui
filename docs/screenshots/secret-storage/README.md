# Secret storage verification

This change is rebased on `fc22f5ddad5f0d14dc9d75129cf570b8af2707ab`.
It includes merged credential binding #107, HTTPS #108, and browser sessions #109.
All credentials are dummy data. Settings, profiles, fixture certificates and
processes are isolated. No user settings were read or changed.

## Persistence and identity rules

Both modes use `src/main/settings-store.ts`. The desktop adapter supplies
Electron safeStorage. Browser mode supplies no encryption provider.

New passwords use a trusted OS keychain or process memory. Linux `basic_text`,
unknown backends, unavailable keychains and encryption errors cannot write a new
password. Environment passwords never enter JSON.

Every retained copy has a separate `passwordIdentity` with its original server
URL and exact trimmed account name. Old files get this metadata before an edit.
Retaining A's password while saving B's settings never changes that binding.
After restart, B cannot return or send A's secret. The old copy can still be
recovered for A when readable. A session password has its own identity too.
A blank-password origin/account change requires a replacement. Same-origin
path changes and account whitespace can still reuse the current password.

Readable old plaintext or ciphertext can migrate to trusted keychain encryption
without changing its binding. Otherwise, old data remains with a notice until
explicit removal. Removal keeps a usable current password in memory. Locked
copies stay intact. Writes commit session changes only after atomic replacement
succeeds. Reads and writes repair existing file permissions to `0600`.

Browser environment values are copied at store creation. An environment password
is bound to the startup effective identity, including a password-only override.
Changing that identity requires environment configuration and a browser-server
restart. URL/account overrides cannot adopt old stored or session secrets.
Invalid legacy and override URLs stay visible in status, but cannot return
credentials. Save validates HTTPS before a write. Loopback HTTP requires the
existing explicit process-only opt-in. Identity comparison is independent of
transport permission. The merged Gerrit client and redirect policy are unchanged.

The merged connection form still disables reuse on identity changes, requires a
replacement and clears typed passwords on origin/account edits. The removal
checkbox is disabled during save and its selection clears on identity changes.
The form reports memory, keychain, environment, locked and retained-copy states.

## Checks

All heavy commands ran sequentially. The final unit command uses one worker:

```sh
npm run typecheck
node --test --test-concurrency=1 src/server/*.test.ts src/main/*.test.ts src/shared/*.test.ts src/renderer/src/*.test.ts src/renderer/src/components/*.test.ts
npm run build
node_modules/.bin/vite build --config vite.web.config.ts --outDir ../../out/browser-secret-security
```

The fresh full desktop and browser builds passed. Final type checks passed and
all 323 tests passed with one worker. Unit coverage includes all storage sources,
origin/account changes, same-origin reuse, unavailable/failed encryption,
locked copies, failed writes, external identity edits, environment snapshots,
invalid URLs, permissions, and independent Node process restarts. A service spy
checks that restarted B sends zero requests with A's retained password.

Real Electron 44.2.0 ran in three separate Linux processes with `basic_text`.
The test deliberately enables Electron's plaintext option to reproduce a
positive `isEncryptionAvailable` result. Production never enables that option.
The app still refuses new persistence. It reads old plaintext and old basic
ciphertext, retains A's binding while B uses a session password, then restarts.
B has no usable password and sends zero requests. Explicit fixture recovery to A
proves A's copy survived. Explicit removal retains the session password; the
third process has none. Settings and window-state writes repair `0644` to `0600`.

The current browser workflow uses the production `scripts/web.mjs`, renderer,
protected API, bootstrap cookie, service and file store. Only Gerrit account and
search responses and the trusted launch-link page are simulated. Native X11
pointer movement, two-second hover pauses, clicks and explained shortcuts drive
the UI. Each mode starts with the same fixed ports/data, a new API process and
an isolated profile. The paired continuous videos show:

1. Explicit removal followed by Test and save. The JSON has no password.
2. Ctrl+R and another connection test. The running server retains its secret.
3. Actual process stop/start. The old API cookie is rejected.
4. A native click on the new one-use startup link. The restarted server has no
   password; Test and save is disabled until a password is entered again.

The merged browser API workflow was rerun in both modes. Bootstrap, save/test,
foreign-origin 403 responses with cookies, unchanged settings, zero attacker
requests, reload, real second tab, and a new profile's 401 remain asserted.
Its saved-password assertion now requires the password field to be absent.
The merged credential and transport UI regressions were also rerun. Selectors
now target direct form labels, so the new checkbox cannot capture field input.
The credential fixture creates a new store on reset and uses that store for all
service calls. Its capture height includes the new notices and success result.
Security assertions were not weakened.

## Inspected evidence

The light/dark versions use the same view, data and scroll position. Static
images show static results. Continuous videos show the sequence. Video formats and durations are checked with ffprobe. Each full clip is decoded
at normal playback rate. Timestamped samples, captions, pointer positions, hover
pauses and result frames are inspected before handoff. Full-page images were inspected for legibility.

| Outcome | Light | Dark |
| --- | --- | --- |
| Removal, reload and real restart | [Video](storage-session-light.mp4) | [Video](storage-session-dark.mp4) |
| Legacy warning and removal control | [Image](legacy-light.png) | [Image](legacy-dark.png) |
| Active memory password after removal | [Image](session-light.png) | [Image](session-dark.png) |
| Password absent after API restart and bootstrap | [Image](restart-light.png) | [Image](restart-dark.png) |
| Observed JSON and file modes | [Image](verification-light.png) | [Image](verification-dark.png) |
| Retained A copy with B active, separate-process outcome | [Image](retained-light.png) | [Image](retained-dark.png) |
| Merged credential replacement UI | [Image](../credential-binding/replacement-connected-light.png) | [Image](../credential-binding/replacement-connected-dark.png) |
| Merged transport UI | [Image](../transport-security/https-connected-light.png) | [Image](../transport-security/https-connected-dark.png) |
| Merged browser API workflow | [Video](../browser-api/browser-session-light.mp4) | [Video](../browser-api/browser-session-dark.mp4) |

[browser-result.json](browser-result.json), [workflow-result.json](workflow-result.json)
and [electron-result.json](electron-result.json) contain observed file and process
results. [verification.html](verification.html) displays those actual snapshots.
[media-inspection.json](media-inspection.json) records video hashes, formats,
durations and inspection method. The JSON images render observed data with ImageMagick. They are separate from
unit-test console output and do not simulate a storage outcome.

The T3 preview reported that AppArmor blocks its browser sandbox. Capture used
isolated Xvfb and Electron Chromium after that explicit failure. Only disposable
test launches use `--no-sandbox`; no production flags or host protections changed.
All temporary fixture servers, recorders, displays and app instances are stopped.

## Reproduce

Build first. Run each UI command separately:

```sh
xvfb-run -a -s '-screen 0 1280x900x24' node_modules/electron/dist/electron --no-sandbox test/secret-storage-ui.cjs
xvfb-run -a -s '-screen 0 1280x900x24' node_modules/electron/dist/electron --no-sandbox test/credential-binding-ui.cjs
xvfb-run -a -s '-screen 0 1280x900x24' node_modules/electron/dist/electron --no-sandbox test/transport-ui.cjs
xvfb-run -a -s '-screen 0 1280x900x24' node_modules/electron/dist/electron --no-sandbox test/browser-api-ui.cjs
```

Bundle `test/secret-storage-electron.ts` with Vite's esbuild dependency, with
`electron` external. Run it three times in separate Electron processes with
`--password-store=basic`. Set `GERRIT_SECRET_TEST_DIR` to one temporary directory
and `GERRIT_SECRET_TEST_PHASE` to `seed`, `retained-restart`, then
`removed-restart`. Copy its `electron-result.json` here. Run
`node test/secret-storage-report.mjs` to regenerate the observed-data images.

## Limits and integration

Secure keychain success/failure unit tests use a test encryption provider.
Live secure Linux keychains, macOS, Windows and Windows ACLs were not tested.
Removing a JSON field does not erase old filesystem blocks or backups. Insecure
copies remain a risk until encrypted or explicitly removed.

The main overlaps are `settings.ts`, `file-settings.ts`, `settings-store.ts`,
`secret-storage.ts`, `types.ts`, `ConnectionWindow.tsx`, and `README.md`, plus
merged UI fixtures and refreshed evidence. Gerrit client validation, redirect
handling, the shared identity helper, transport policy, and protected API code
have no implementation changes. No push, PR, merge or deployment is part of this
worktree handoff.
