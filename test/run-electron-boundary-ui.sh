#!/usr/bin/env bash
# Isolate D-Bus helpers before Electron starts. Run only one capture at a time.
set -euo pipefail
boundary_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
boundary_desktop=$(mktemp -d "${TMPDIR:-/tmp}/gerrit-boundary-desktop.XXXXXX")
trap 'rm -rf -- "$boundary_desktop"' EXIT
mkdir -p "$boundary_desktop/config" "$boundary_desktop/cache"
cd -- "$boundary_root"
XDG_CONFIG_HOME="$boundary_desktop/config" XDG_CACHE_HOME="$boundary_desktop/cache" \
  dbus-run-session -- xvfb-run -a -s '-screen 0 1280x900x24' \
  "$boundary_root/node_modules/.bin/electron" "$boundary_root/test/electron-boundary-ui.cjs"
