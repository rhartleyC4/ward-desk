/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Shows push notifications (day-ahead summaries) and opens the app when one is tapped.
      workbox: { importScripts: ['/push-handler.js'] },
      manifest: {
        name: 'Ward Desk',
        short_name: 'Ward Desk',
        description: 'Sacrament meetings, bishopric agenda, and callings in one place.',
        theme_color: '#1b2233',
        background_color: '#f5f2ea',
        display: 'standalone',
        start_url: '/',
        // PNGs are built from scripts/icons/ by scripts/build-icons.sh.
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/**/*.test.ts'],
          setupFiles: ['src/test/setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          // Tests share one local database, so run files one at a time.
          fileParallelism: false,
          testTimeout: 15_000,
        },
      },
    ],
  },
})
