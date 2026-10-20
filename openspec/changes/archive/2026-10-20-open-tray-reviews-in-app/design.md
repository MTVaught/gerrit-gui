# Design

## Context

See `proposal.md` for the problem and scope assumption. `TrayController.categorySubmenu` passes a `ChangeLink` to `openChange`. The handler in `src/main/index.ts` always calls `service.changeUrl` and `openWebUrl`. Needs Review links already include `reviewLink` comparisons; the other categories carry only the change ID and project.

The board's `ReviewButton` and `OwnerReviewOptions` already route patch set links through `LocalReviewProvider` when `localReview` is enabled. The provider owns the review dialog independently of board rows. There is no native review request subscription. `showTab` waits for page load, but page load alone does not prove that React has installed a listener.

`LocalReview` checks `ReviewComments.canClose` when its Close button is used. Directly replacing provider state would bypass that protection. Browser-mode API implementations and UI fixtures implement the shared `Api` contract and must remain compatible.

## Goals / Non-Goals

Goals:
- Use the existing review provider and mutation path for native navigation.
- Keep native request delivery reliable across window creation and renderer reload.
- Preserve browser-only intent in the existing `api.openChange` method.

Non-goals:
- No separate review window, OS jump list, taskbar toolbar, or URL protocol handler.
- No changes to review permissions, workflow actions, category counts, or settings storage.

## Decisions

### Route native selections separately from explicit web links

Add a native selection handler in the main process. Read the saved `localReview` preference on each selection. If disabled, use the existing URL path with the original `ChangeLink`. If enabled, activate the main window and deliver a structured review request.

Do not change `api.openChange` globally. It intentionally opens change pages from board titles and explicit web menu actions. A global preference check would change those actions too.

### Resolve metadata for the selected member

For opt-in navigation, fetch the selected change through `service.fetchChange` to obtain its own subject and current revision metadata. Retain a supplied `patchSet` and `basePatchSet` exactly. For links without a patch set, resolve the current patch set and compare it with base. Validate required metadata before delivery and show a visible app error if it cannot be resolved.

This adds a metadata read to native in-app navigation. Passing only a family subject would give sequence members the wrong title. Adding all metadata to the badge payload would avoid the read but would add a second contract and could use stale data. Keep the current action menu data contract and update its browser-only comments where needed.

### Use a readiness handshake and acknowledged request

Extend the typed API and preload with a native review request subscription and a ready/acknowledgment path. Install the renderer listener before announcing readiness. Retain the latest unacknowledged request in main and deliver it after readiness, including when a new window must be created. Clear readiness when the renderer reloads or the window closes. Remove renderer listeners on unmount.

Give selections monotonic request IDs. Ignore older metadata responses and duplicate delivery. A newer selection replaces an older pending selection; completion, cancellation, and visible error handling acknowledge the request. Use the existing trusted IPC boundary for renderer messages. Browser mode supplies inert implementations. Do not rely only on `did-finish-load`, arbitrary delays, or JavaScript injection.

### Reuse the provider and its edit protection

Subscribe inside the mounted review provider or a child that can call it. Native navigation clears the Settings view and opens the existing viewer through the same mutation callback used by board review controls. Keep compact mode active.

Expose the existing review close check through a narrow imperative handle or callback. Check it before replacing the active review, including a new comparison of the same change. If it refuses navigation, retain the active review and acknowledge cancellation. Ensure an accepted same-change request applies its new comparison, since the current dialog is keyed only by change ID. Report metadata or delivery errors through the app's visible error path. Do not fall back to a browser after opt-in routing fails.

## Risks / Trade-offs

- Metadata reads can fail or complete out of order. Keep the active review until resolution succeeds, show errors, and reject stale request IDs.
- Renderer startup can lose fire-and-forget messages. Use explicit readiness and acknowledgment with one retained pending request.
- Replacing the dialog can discard local comment edits. Reuse the existing discard prompt and pending-write check before applying the request.
- Native menu behavior differs by OS. Test routing independently, then capture the real native interaction on an available desktop. Record the tested platform and any untested platforms.

## Migration plan

No settings or data migration is needed. The existing opt-in remains disabled by default. Ship the native handler, shared API, preload, browser no-ops, and renderer handler together. Reverting those changes restores native browser navigation without changing saved settings or Gerrit drafts.

## Verification and evidence

Use focused tests for preference routing, comparison preservation, stale requests, startup delivery, acknowledgments, cancellation, and errors. Retain the platform tests in `src/main/tray-click.test.ts` and the action-menu checks in `src/shared/model.test.ts`. Extend the Electron fixture pattern from `test/owned-review-ui.cjs` to check local review loading and explicit browser destinations.

For behavioral proof, use the `record-actions` skill and real pointer actions on Linux with a working native tray host, or another available supported desktop. Record the same native selection workflow in light and dark modes, including opt-in, a hidden window, a selected change, the resulting comparison, and opt-out browser routing. Use fixed fixture data and label it as simulated Gerrit data. Keep the pointer visible, hover about two seconds before clicks, add brief captions, and pause on results. Save paired videos with `-light` and `-dark` suffixes and inspect both before sharing. If a real native tray cannot be provided within scope, report the exact limitation and mark native visual verification incomplete. A simulated event or JavaScript click does not replace native interaction evidence.
