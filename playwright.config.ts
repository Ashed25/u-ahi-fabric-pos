import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173', // BASE_URL=https://… runs the tests against the live site
    viewport: { width: 1280, height: 800 }, // ~10" Android tablet, landscape
    hasTouch: true,
  },
  webServer: { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: true },
})
