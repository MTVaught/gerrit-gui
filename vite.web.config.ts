// Browser mode (pnpm web): serve the renderer with plain Vite, no Electron.
// The UI calls /api/*, proxied to the local API server in src/server.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { browserOrigin } from './src/server/browser-server.ts'

const origin = browserOrigin(process.env['WEB_ORIGIN'] ?? `http://localhost:${process.env['WEB_PORT'] ?? 5173}`)

export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    cors: false,
    allowedHosts: [origin.hostname],
    port: Number(process.env['WEB_PORT'] ?? 5173),
    strictPort: true,
    proxy: { '/api': { target: `http://127.0.0.1:${process.env['API_PORT'] ?? 5174}`, changeOrigin: false, xfwd: false } },
  },
})
