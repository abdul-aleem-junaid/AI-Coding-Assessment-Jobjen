import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    // Same-origin /api in dev → no CORS. Vite forwards to the NestJS backend.
    // Requires VITE_API_BASE_URL to be empty so the app uses the relative /api
    // path (see src/lib/api.js + src/lib/crypto.js). Override the target via
    // VITE_DEV_PROXY_TARGET if your backend isn't on :3001.
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_PROXY_TARGET || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
