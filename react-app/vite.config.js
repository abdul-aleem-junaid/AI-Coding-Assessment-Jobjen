import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    // No /api proxy: the app sends every request straight to VITE_API_BASE_URL
    // (see src/lib/api.js + src/lib/crypto.js) in dev and prod alike. The dev
    // backend must allow this origin via CORS (the NestJS allow-list already
    // permits localhost).
  },
})
