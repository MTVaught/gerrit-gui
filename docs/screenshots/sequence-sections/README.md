# Sequence sections evidence

The native Electron renderer was tested on Linux under Xvfb with simulated
Gerrit changes, reviewers, and API responses. Mouse movement, hovering,
clicks, review submission, and tab navigation use real X11 input. The
workflow recordings include captions and two-second pauses before clicks.

Each light and dark pair uses the same data, view, scroll position, and
window dimensions. The full window is 1440 × 900; compact is 440 × 700.

- `reviewing-light.png` and `reviewing-dark.png` show the dedicated Sequences
  section with two pending reviews and one approved member.
- `mine-light.png` and `mine-dark.png` show mixed member states in My Changes.
- `reviewing-compact-light.png` and `reviewing-compact-dark.png` show the
  corresponding compact reviewer view.
- `mine-compact-light.png` and `mine-compact-dark.png` show the compact owner view.
- `review-workflow-light.mp4` and `review-workflow-dark.mp4` show a sequence
  staying in Needs Review after the first vote, leaving after the second,
  and remaining in Reviewing → Sequences while other reviewers are pending.

Build with `npm run build`, then run `test/sequence-ui.cjs` through Electron
on a 1440 × 900 Xvfb display with `xdotool` and `ffmpeg` available. The test
uses `test/fixtures/sequence-preload.cjs`; it never contacts a real Gerrit
server. Use a working Chromium sandbox. In the capture environment, the
existing `chrome` AppArmor profile allowed user namespaces when running
Electron through `aa-exec -p chrome` with `--disable-setuid-sandbox`.

The shared T3 preview disconnected during navigation and timed out when
reopened, so these artifacts come from the native desktop test.
