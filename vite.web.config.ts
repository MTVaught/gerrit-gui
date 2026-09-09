// Browser mode (npm run web): serve the renderer with plain Vite, no Electron.
// The UI calls /api/*, proxied to the local API server in src/server.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  server: {
    port: Number(process.env['WEB_PORT'] ?? 5173),
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${process.env['API_PORT'] ?? 5174}` },
  },
})
