import { execFileSync } from 'node:child_process'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/** Short commit hash of the working tree at build time, with "+" when it has uncommitted changes. */
function buildCommit(): string {
  try {
    const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return git('rev-parse', '--short', 'HEAD') + (git('status', '--porcelain') ? '+' : '')
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()], define: { __BUILD_COMMIT__: JSON.stringify(buildCommit()) } },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: { plugins: [react()] },
})
