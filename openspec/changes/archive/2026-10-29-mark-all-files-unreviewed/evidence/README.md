# Change evidence

## Archive

- [Archive result in light mode](archive-light.png)
- [Archive result in dark mode](archive-dark.png)
- [Archive report source](archive-report.html)

Both archive screenshots use the same 728 by 660 viewport, content, and scroll position. Both were inspected for readable text and complete content. They report the verified filesystem and spec-sync outcome. Capture used Chromium Headless Shell on Linux after T3 preview reported the AppArmor sandbox limitation recorded below.

## Implementation

The reset workflow was implemented and verified in Linux Electron with simulated Gerrit data. See [verification](../verification.md) for checks, setup, and platform limits.

- [Final crossed-out checkmark in light mode](reset-heading-light.png)
- [Final crossed-out checkmark in dark mode](reset-heading-dark.png)

The recordings below show the same workflow before the final glyph selection.

- [Light video](mark-all-unreviewed-light.mp4)
- [Dark video](mark-all-unreviewed-dark.mp4)
- [Light minimum-width pane](reset-narrow-light.png)
- [Dark minimum-width pane](reset-narrow-dark.png)

## Proposal

These earlier images show the completed planning report before implementation. They demonstrate planning only.

- [Light mode](proposal-light.png)
- [Dark mode](proposal-dark.png)
- [Report source](proposal-report.html)

Both screenshots use the same 848 by 720 viewport, content, and scroll position. Both were inspected for readability, complete text, and matching layout. Capture used Chromium Headless Shell on Linux. No Gerrit data or review events ran during capture.

Strict validation passed for `mark-all-files-unreviewed` at proposal time. OpenSpec reported all four planning artifacts complete. The delta contains four requirements and 12 scenarios. The eight implementation tasks were then unchecked.

T3 collaborative browser and HTML preview returned: "This host blocks the sandbox T3's browser runs in (AppArmor on Ubuntu 23.10+)." A full Chromium capture also timed out. Chromium Headless Shell resolved the planning screenshot capture limit. The report was published through T3 HTML render.
