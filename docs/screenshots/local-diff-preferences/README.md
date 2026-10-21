# Local diff preferences verification

The change applies each valid preference edit and persists it in application storage. Close and Escape retain edits. Save, Cancel, and Gerrit account preference access have been removed.

## Recorded workflow

The recordings use real pointer and keyboard input on Linux. Each starts with Follow application, Whole file context, and font size 13. The user sets font size 16 and context 10, closes and reopens preferences, selects the opposite diff theme, keeps the same dialog open, changes Tab width to 6, dismisses explicitly with Escape, reopens, and checks the shared setting in Appearance.

- Desktop: [Light](desktop/workflow-light.mp4), [Dark](desktop/workflow-dark.mp4).
- Browser mode: [Light](browser/workflow-light.mp4), [Dark](browser/workflow-dark.mp4).

Each pair uses the same review data, framing, initial source position, and pace. Captions explain keyboard actions. The pointer moves to each control and waits about two seconds before each click. The files are H.264 MP4, 1600 by 1000, 20 frames per second, and about 57 seconds long. `video-checks.json` records metadata and a successful decode of every frame. Sampled frames and full-size final frames were inspected for labels, captions, pointer position, theme changes, and the saved Appearance choice.

The theme change checks assert that the original dialog remains open and modal, receives zero close events, and accepts a Tab width edit without reopening. `desktop/capture-results.json` and `browser/capture-results.json` record these checks in both theme directions. The previous recording sent Escape immediately after selecting the theme. The updated recording pauses for four seconds, makes another edit, and labels the later Escape action explicitly.

Short clips isolate the theme selection and further editing, ending while preferences is still open:

- Desktop: [Light](desktop/theme-stays-open-light.mp4), [Dark](desktop/theme-stays-open-dark.mp4).
- Browser mode: [Light](browser/theme-stays-open-light.mp4), [Dark](browser/theme-stays-open-dark.mp4).

Static captures show the complete form and compact layout:

- Desktop form: [Light](desktop/preferences-light.png), [Dark](desktop/preferences-dark.png). Compact form: [Light](desktop/preferences-compact-light.png), [Dark](desktop/preferences-compact-dark.png).
- Browser form: [Light](browser/preferences-light.png), [Dark](browser/preferences-dark.png). Compact form: [Light](browser/preferences-compact-light.png), [Dark](browser/preferences-compact-dark.png).

## Test scope and results

Gerrit data and write failures are simulated. The renderer, Monaco editor, localStorage updates, settings context, desktop settings store, and browser file settings store are application code. Desktop uses the review fixture preload. Browser mode uses the application's HTTP adapter against the fixture server, rendered in Electron's Chromium engine. Windows, macOS, and other browser engines were not tested.

`desktop/results.json` and `browser/results.json` record successful checks for all preference fields, numeric validation, automatic persistence, Close, Escape, Enter, focus restoration, review continuity, local write failures, theme write failures, retry, rapid edits, read-only operation, legacy and invalid local values, and reload. Both recorded zero account diff preference requests. Service tests retain reviewed-file and fix permission checks. A production browser server test confirms that the removed preference methods return 404 without an outbound request.

`desktop/restart-results.json` records a separate desktop process reopening the same isolated profile and retaining preferences and diff theme. The fixture provides its dummy connection password again because this Linux test environment keeps that password in session memory. This does not reset the persisted preferences.

The following checks passed:

- `pnpm test`, 350 tests.
- `pnpm typecheck`.
- `pnpm build`.
- `test/review-ui.cjs` for full-file navigation, preferences, comparison caching, and reviewed-file behavior.
- `test/diff-theme-ui.cjs` in desktop and browser mode, plus the separate desktop restart check.
- `openspec validate localize-diff-preferences --strict`.

T3 preview returned "This host blocks the sandbox T3's browser runs in (AppArmor on Ubuntu 23.10+)." Capture used the repository's Electron/Xvfb workflow and the record-actions skill. No host configuration was changed.

## Repeat the checks

Build first, then run the desktop checks:

```sh
pnpm build
xvfb-run -a node_modules/.bin/electron --no-sandbox test/review-ui.cjs
xvfb-run -a -s '-screen 0 1600x1000x24' node_modules/.bin/electron --no-sandbox test/diff-theme-ui.cjs
```

For browser mode, start these two temporary processes in separate terminals:

```sh
PORT=5184 node --no-warnings test/diff-theme-server.ts
WEB_PORT=5183 API_PORT=5184 node_modules/.bin/vite --config vite.web.config.ts
```

Then run:

```sh
BROWSER_THEME_FIXTURE=1 xvfb-run -a -s '-screen 0 1600x1000x24' node_modules/.bin/electron --no-sandbox test/diff-theme-ui.cjs
```

Add `CAPTURE_DIFF_THEME=1` to either command to record its paired videos. For desktop restart, set `DIFF_THEME_TEST_DIR` to the isolated directory printed by the desktop check and add `DIFF_THEME_REOPEN=1`. Stop the two browser fixture processes after the checks.

## Rebase validation

The branch was rebased onto origin/main at `0f1478a2c32807bc0598be9b0763ddbb74076c94`. All 350 tests, typecheck, build, and strict validation of all 10 main specs passed. The full review, independent wrapping, rebase highlight, and diff preferences UI workflows passed in the rebased checkout. The wrapping and rebase highlight workflows now dismiss preferences with Close. `post-rebase-checks.json` records this result.
