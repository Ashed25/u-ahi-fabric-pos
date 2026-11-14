import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // GitHub Pages serves from /<repo>/; set by the deploy workflow.
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: { globPatterns: ['**/*.{js,css,html,woff,woff2,png,svg}'] },
      manifest: {
        name: 'ဦးအဟိ အထည်ဆိုင်',
        short_name: 'ဦးအဟိ POS',
        lang: 'my',
        display: 'standalone',
        orientation: 'any',
        background_color: '#ffffff',
        theme_color: '#1e3a8a',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
