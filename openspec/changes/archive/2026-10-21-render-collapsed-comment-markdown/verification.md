# Verification

The source thread implemented this feature before OpenSpec planning. This adoption created the behavior contract and verified the existing implementation through apply.

Typecheck, production build, strict change validation, and the focused Electron regression passed on 2026-10-21. Both inline comments and All comments render collapsed Markdown. Bold text, code, quotations, links, block elements, and hard breaks retain a single-line preview. Expanding restores block rendering. Link clicks keep the comment collapsed.

The screenshots in `docs/screenshots/collapsed-comment-markdown/collapsed-markdown-light.png` and `collapsed-markdown-dark.png` show the same comment, source view, scroll position, and framing. Both were inspected for readability and layout.

Run `pnpm typecheck`, `pnpm build`, and `dbus-run-session -- xvfb-run -a -s '-screen 0 1600x1000x24 -nolisten tcp' node_modules/.bin/electron --no-sandbox test/review-collapsed-markdown-ui.cjs` to repeat these checks.

Tested on Linux Electron with simulated Gerrit data. The test sandbox flag applies only to the local fixture launcher. The shared browser is blocked by the host's AppArmor sandbox policy. Native macOS, Windows, and a live Gerrit service were not tested.
