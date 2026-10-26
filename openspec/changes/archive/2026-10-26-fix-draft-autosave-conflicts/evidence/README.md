# Evidence index

The change is implemented and archived. See [fix verification](verified/README.md)
for the real Gerrit recordings and [archive checks](archive-result.json) for
the completed sync. Archive screenshots are in [light](archive-light.png) and
[dark](archive-dark.png) mode.

## Historical proposal evidence

These screenshots show the completed planning report, generated from the
artifact files and OpenSpec validation. They do not show an implemented fix.

- [Light mode](proposal-light.png)
- [Dark mode](proposal-dark.png)
- [Report source](proposal-report.html)
- [Planning checks](planning-check.json)
- [Capture checks](capture-results.json)

The plan has two capability deltas, four requirements, 15 scenarios, and nine
unchecked implementation tasks. Strict OpenSpec validation passed.

Both images use the same 848 by 922 viewport, content, and zero scroll position.
They were inspected for readable text and complete content. Capture checks
confirm the expected report rows, theme, and absence of horizontal overflow.
Capture used an isolated Linux/Electron process with static report data.
No Gerrit events or application workflows were simulated or tested in this step.

T3 `html_preview` returned `This host blocks the sandbox T3's browser runs in
(AppArmor on Ubuntu 23.10+)`. The local Electron capture resolved the report
capture limit. `html_render` published the report successfully. Application
visual verification remains implementation work, as specified in tasks.md.

## Archive verification

Both main specs match the archived deltas. Their titles, Purpose sections, and
15 unrelated requirements are unchanged. All 16 OpenSpec checks pass under
strict validation after archive. All 38 checked relative links resolve.

The archive report was captured with an isolated Linux/Electron process after
T3 preview returned `This host blocks the sandbox T3's browser runs in
(AppArmor on Ubuntu 23.10+)`. The local capture resolved this limit.
[Light mode](archive-light.png) and [dark mode](archive-dark.png) use the same
848 by 855 viewport, data, and zero scroll position. Both images were inspected
for readability and complete content. These are static filesystem verification
results. The real application recordings remain in [fix verification](verified/README.md).
See [report source](archive-report.html) and [capture checks](archive-capture.json).
