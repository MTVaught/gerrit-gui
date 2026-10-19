# Diff theme verification

The controls use one application setting with Light, Dark, and Follow application choices. Appearance uses radio controls and saves immediately. Diff Preferences uses its existing Gerrit-style dropdown layout, with no theme subtext. Selecting an option changes only the draft. Save commits it; Cancel and Escape discard it.

## Evidence

The paired recordings use the same review data, window size, initial selection, and action sequence. Each starts with the application following the system and Diff theme set to Follow application. The workflow selects the opposing theme, cancels, reopens preferences, saves the opposing theme, and checks the value in Appearance after a renderer reload.

- [Light workflow](workflow-light.mp4)
- [Dark workflow](workflow-dark.mp4)
- Diff Preferences: [Light](preferences-light.png), [Dark](preferences-dark.png)
- Appearance: [Light](appearance-light.png), [Dark](appearance-dark.png)
- Compact Diff Preferences: [Light](browser/preferences-compact-light.png), [Dark](browser/preferences-compact-dark.png)
- Opposing application and review themes: [Light application with dark review](override-light.png), [Dark application with light review](override-dark.png)

The suffix on the override images names the application theme. The review uses the opposite theme.

## Test environment

Tested on Linux with Electron 44 in an isolated Xvfb desktop at 1600 by 1000. Gerrit review data, comments, and server writes are simulated by the existing local review fixture. Desktop application settings use the real Electron settings store in a temporary user-data directory. The HTTP browser test uses the real browser renderer API and file settings store, hosted in an Electron window without a preload.

The T3 collaborative preview could not reach either the worker-relative port or the worker's LAN address. Browser mode was therefore checked through its HTTP API in the isolated desktop. Native Windows and macOS behavior was not tested.

## Repeat the checks

Build with `pnpm build`. Start an isolated Xvfb display and pass its DISPLAY to Electron. The Electron sandbox helper must have the permissions required by the installed vendor runtime.

- Desktop UI checks: `node_modules/.bin/electron test/diff-theme-ui.cjs`
- Paired desktop recording: `CAPTURE_DIFF_THEME=1 node_modules/.bin/electron test/diff-theme-ui.cjs`
- Browser fixture API: `PORT=5184 node --no-warnings test/diff-theme-server.ts`
- Browser renderer: `WEB_PORT=5183 API_PORT=5184 node_modules/.bin/vite --config vite.web.config.ts`
- Browser UI checks: `BROWSER_THEME_FIXTURE=1 node_modules/.bin/electron test/diff-theme-ui.cjs`

The desktop checks include failed Gerrit and settings writes, draft retention, retry without repeating confirmed Gerrit writes, theme-only saves without Gerrit writes, and unchanged Gerrit payloads. Browser checks include both selectors, persistence, following system changes, explicit overrides, and inherited dialog appearance. Unit tests cover theme resolution and save ordering. No real Gerrit account is changed.

## Results

All 248 unit tests passed. Type checking and the production build passed. Desktop and browser UI checks passed. A separate Electron process reopened the desktop test user-data directory and confirmed the saved diff theme after a full application restart. The compact control column fits the full Follow application label in both modes.

Both H.264 recordings decode without errors and use yuv420p at 1600 by 1000. Their durations are 46.10 seconds in light mode and 45.75 seconds in dark mode. Exported frames were inspected across the selection, Cancel, Save, and reopened Appearance states, including pointer position, captions, and the held final result.
