# Dependency advisory review

Checked on 2026-10-19 with pnpm 12.3.4 and Node 24.22.0 on Linux x64.
The npm audit endpoint and the linked GitHub reviewed advisories are the sources
for the affected ranges. Counts below describe this run only. This branch uses
merged security base `b6b0e67545826805a3b0fabc0820116309ef3f73`.

## Result

A fresh audit of the current main lockfile at the base above reported 15
findings: 8 high, 5 moderate, and 2 low. The final full audit reports one moderate
finding, in the optional build dependency `sprintf-js`. The production
dependency audit reports zero.
There are no audit exclusions or ignored advisories.

Monaco is compiled into the renderer. It is now a development dependency so
electron-builder does not also ship its unused `dev/` and `min/` distributions.
Those distributions contain their own old sanitizer. A production dependency
audit alone does not check code compiled into the renderer. The full audit,
browser probes, and artifact checks cover that code separately.

## Changes and usage

| Package | Before | After | Advisory and use |
| --- | --- | --- | --- |
| `brace-expansion` | 1.1.18, 2.1.4, 5.0.9 | 1.1.21, 2.1.7, 5.0.12 | [Nested recursion](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [comma parsing](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p), and [quadratic expansion](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr). Build file patterns through electron-builder, minimatch, glob, asar, and universal. Nine audit entries across three version lines. |
| `fast-uri` | 3.1.7 | 3.1.8 | [Host normalization](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj). electron-builder configuration validation through AJV. |
| `http-cache-semantics` | 4.2.0 | 4.3.0 | [Cached response disclosure](https://github.com/advisories/GHSA-ch52-4w7c-c8xp). Electron build downloads through `@electron/get`, got, and cacheable-request. |
| `source-map-js` | 1.2.1 | 1.2.2 | [Indexed map denial of service](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). Vite/PostCSS build processing. |
| `dompurify` | 3.4.15 | 3.4.17 | [Detached hook subtree](https://github.com/advisories/GHSA-p98j-92pf-mc4p) and [raw text root](https://github.com/advisories/GHSA-6688-9rhm-gjv2). Both advisory fixes start at 3.4.16. |

The build dependencies use compatible releases already allowed by their parents.
The Monaco DOMPurify pin needs an override in `pnpm-workspace.yaml`.
The existing Monaco patch also replaces
`esm/vs/base/browser/dompurify/dompurify.js` with a default export from the audited
`dompurify` package. This removes the ESM vendored implementation and prevents
the package and active bundled sanitizer from drifting apart. The existing
alignment, inline decoration, and overview ruler patches remain in place.

`ReviewEditor.tsx` imports Monaco ESM modules, including hover rendering.
Monaco `domSanitize.js` imports the replaced file. Its sanitizer takes HTML
strings and uses `RETURN_TRUSTED_TYPE` or `RETURN_DOM_FRAGMENT`, without
`IN_PLACE`. The two low advisories require `IN_PLACE` with Node inputs.
Comment text uses `ReviewMarkdown.tsx` and react-markdown, with no raw HTML
plugin. Source file content goes into Monaco text models. No exploitable app
XSS was confirmed. The dependency defects were reproduced in deliberately
configured local browser probes, outside the app's normal sanitizer settings.

## Remaining advisory

[GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)
affects `sprintf-js` 1.1.3. It has no published fixed release as of this check.
A format string such as `%.1000000f` makes the numeric formatter throw
`RangeError`. This remains a package defect.

The only installed paths are:

```text
electron-builder > app-builder-lib > @electron/get > global-agent > roarr > sprintf-js
electron-builder > dmg-builder > app-builder-lib > @electron/get > global-agent > roarr > sprintf-js
```

Both paths are development-only and optional. `@electron/get` 3.1.0 loads
`global-agent` for proxy setup when `ELECTRON_GET_USE_PROXY` is set, or when its
proxy initializer is called explicitly. The application does not call it.
The packaged application contains neither `global-agent` nor `sprintf-js`.

In global-agent 3.0.0, logger messages are fixed strings. Destination URLs,
proxy configuration, response headers, and serialized errors go into context
objects. Roarr 2.15.4 formats the message string, rather than the context.
Logging is disabled unless `ROARR_LOG` enables it. Exact installed source
paths and hashes are recorded in
[reachability.json](security-dependencies/reachability.json).

`test/security-build-logging.test.cjs` enables logging, intercepts actual
`sprintf` format arguments, and sends a request through a local HTTP proxy.
The request path and response header contain the hostile precision string.
The request completes, the hostile text reaches logger context, and no format
argument contains it. A direct formatter call still throws as the advisory
states. This supports the conclusion that this dependency path has no current
external format-string input. It does not make the package safe for other uses.
Review this exception when electron-builder changes its proxy logger or when
a fixed upstream version becomes available.

## Verification and evidence

Raw audit results and recorded check results are in
[security-dependencies/](security-dependencies/). Reproduce the checks with:

```sh
pnpm install --frozen-lockfile
pnpm audit --json > docs/security-dependencies/audit-after.json
pnpm audit --prod --json > docs/security-dependencies/audit-production.json
node --test --test-concurrency=4 src/server/*.test.ts src/main/*.test.ts src/shared/*.test.ts src/renderer/src/*.test.ts src/renderer/src/components/*.test.ts
pnpm typecheck
pnpm build
pnpm exec vite build --config vite.web.config.ts --outDir ../../out/web
node node_modules/electron-builder/cli.js --dir --linux --publish never -c.npmRebuild=false -c.electronDist=node_modules/electron/dist
node test/security-dependencies-artifacts.cjs > docs/security-dependencies/artifacts.json
node --test test/security-build-logging.test.cjs
xvfb-run -a node_modules/.bin/electron --no-sandbox test/security-dependencies-ui.cjs
xvfb-run -a node_modules/.bin/electron --no-sandbox test/review-ui.cjs
REBASE_SCREENSHOT_DIR=/tmp/dependency-review-captures xvfb-run -a -s '-screen 0 1440x1000x24' node_modules/.bin/electron --no-sandbox test/review-rebase-ui.cjs
```

The sandbox flag is for the isolated Linux test process. No live credentials,
Gerrit connection, account changes, or deployment are used. The tests use local
markup, simulated review data, and temporary profile directories.
The successful Linux directory package uses two command-only overrides.
`npmRebuild=false` skips native addon rebuilding, and `electronDist` uses the
installed vendor Electron 44.2.0 distribution. These dependencies add no native
module. Production packaging configuration is unchanged. The first interrupted
pass stalled during download-based packaging; the new package completed after
the host load stabilized.

All 340 unit tests pass with `--test-concurrency=4`, including server API,
credential identity, HTTPS, secret retention, startup cleanup, and Electron
boundary assertions. Type checking, desktop build, and browser build pass.
Vite reports its existing warning about large browser chunks.

The actual `dist/linux-unpacked/resources/app.asar` is 33,291,595 bytes.
Its SHA-256 is
`41b293aa771caa9128c821244d4064e8e9200b29647ef77a09b88f476dfda4dd`.
[artifacts.json](security-dependencies/artifacts.json) records the source/base,
archive hash, lockfile and patch hashes, and inspection results. The archive
has the fixed compiled sanitizer. None of its 632 JavaScript files contains
`3.4.15`; the Monaco package, unused distributions, and optional build proxy
logger are absent. All 24 renderer scripts plus main and preload match the
current production build byte for byte. The archive build source is rebased
commit `5a7ea88083b9a621e8fbd164aac5621b8f527d91`; later changes in this branch
only refine tests, reports, and evidence.

Fresh sanitizer probes use the same Monaco ESM paths as the application.
Both removal hooks strip the retained image handler, the raw text root throws,
safe HTML still renders, and the payload execution count is zero. A real mouse
click starts each run. Paired captures also display the current audit counts
and the verified archive hash. The older `sanitizer-before.txt` records the
original failing 3.4.15 control from the first pass; it is historical evidence.
The capture harness rejects stale archive, lockfile, or Monaco patch hashes
before it renders the report.

The broad `test/review-ui.cjs` still failed at the first-select assertion on
rebased main, reading Diff theme `application` instead of Context `-1`.
`review-ui-before-selector-fix.txt` records that fresh failure. The assertion now
selects Context by its visible label. The full test then passes for 100,000-line
virtualization, wheel and scrollbar input, synchronized panes, keyboard and
search behavior, tooltip hit testing, preferences, caching, comparisons, and
reviewed flags. The earlier `baseline-review-ui.txt` is historical evidence
from pre-security baseline `9d1925628ea0a02939d00ae41ee251123bf117bc`.

The separate Monaco rebase test uses real mouse clicks on visible controls,
opens More before Go to line, and restores code focus before keyboard input.
It checks both diff modes, inline decorations, whitespace preferences, overview
markers, and no extra source requests. Its paired captures wait for both the
application and Monaco theme. No product control or security assertion was
removed to make a fixture pass.

The unchanged real-main Electron boundary UI test also passes in light and dark
mode. All 42 IPC channels reject rogue senders; child frames and a navigated app
are rejected; popup/navigation/redirect guards, connection save, reload, hash
routing, and external link handling pass. This test uses its existing explicit
process loopback opt-in and dummy credentials. No live settings are used.
The full unit suite also exercises browser session authentication, origin/CSRF
checks, and cleanup before listeners start. Live Gerrit integration tests were
not run.

The T3 preview could not start because the host AppArmor policy blocks its
sandbox. The documented Electron/Xvfb workflow supplied the captures instead.
Both pairs were inspected for matching data, framing, and readability:

- Sanitizer DOM result: [Light](screenshots/security-dependencies/sanitizer-light.png), [Dark](screenshots/security-dependencies/sanitizer-dark.png).
- Compiled review renderer: [Light](screenshots/security-dependencies/review-light.png), [Dark](screenshots/security-dependencies/review-dark.png).

Only Linux x64 was tested. Windows and macOS packages were not built.

## Integration files

Dependency changes touch `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`,
and `patches/monaco-editor@0.57.0.patch`. Keep the Monaco dependency placement,
override, patch, and regenerated lockfile together. The rebase onto all five
merged security fixes had no conflicts. The test script still includes server
tests. Application source files, IPC and popup guards, HTTPS policy, credential
binding, API protection, and secret storage controls are unchanged from the
merged base. Test-only changes repair the Context selector, require visible
mouse targets, and allow dependency captures in a separate output directory.

The only remaining advisory is the documented optional build dependency. No
major tooling rewrite or audit suppression was used. The production audit,
compiled-code checks, and archive inspection have separate recorded results.
The current captures replace the old screenshots; they are from the rebased
build and isolated fixtures described above.
