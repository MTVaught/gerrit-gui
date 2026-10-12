# Visual evidence requirements

- For UI issues and code changes affecting visible appearance or interaction,
  provide visual evidence in the final response. Choose the format that best
  demonstrates the issue or change.
- Use screenshots for static results such as layout, styling, text, or a new
  setting. Use video when the sequence, timing, or transition matters, such as
  clicking a tray icon, navigating, hiding/restoring a window, or opening a menu.
  Include both formats only when they demonstrate different relevant aspects.
- For videos, use the `record-actions` skill. Keep the pointer visible, move it
  to each target, and hover for about two seconds before clicking. Pause on the
  result and use brief captions so a person can understand each action. Prefer
  visible clicks; explain any keyboard shortcuts before using them.
- Capture UI evidence in both light and dark mode. Screenshots must use the
  same view, data, and scroll position. Videos must demonstrate the same
  workflow with comparable framing, data, starting state, and pacing.
- Inspect both versions for readability, layout issues, and whether they clearly
  demonstrate the claimed result before sharing them.
- Show or link both versions in chat and label the mode. Save paired artifacts
  with `-light` and `-dark` filename suffixes before the extension.
- Use real input actions for behavioral proof. State when data or events are
  simulated and which platform was tested. If capture is blocked, report the
  specific limitation and the verification performed instead of claiming proof.
