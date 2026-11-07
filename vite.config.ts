/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/** The commit being built, so an error report says which version hit it. */
function appVersion(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'dev'
  }
}

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Puts the ward's name in index.html: the tab title, and the name iOS gives a Home Screen icon. */
function wardNameInHtml(wardName: string): Plugin {
  // 'pre', so it runs before Vite's own %VITE_…% replacement, which would warn about %WARD_NAME%.
  return { name: 'ward-name', transformIndexHtml: { order: 'pre', handler: (html) => html.replaceAll('%WARD_NAME%', escapeHtml(wardName)) } }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // VITE_WARD_NAME (WARD_NAME on GitHub) names the installed app. src/lib/ward.ts reads the same.
  const wardName = loadEnv(mode, process.cwd(), 'VITE_').VITE_WARD_NAME?.trim() || 'Ward Desk'
  return {
    define: { __APP_VERSION__: JSON.stringify(appVersion()) },
    plugins: [
      react(),
      wardNameInHtml(wardName),
      VitePWA({
        registerType: 'autoUpdate',
        // Shows push notifications (day-ahead summaries) and opens the app when one is tapped.
        workbox: { importScripts: ['/push-handler.js'] },
        manifest: {
          name: wardName,
          short_name: wardName,
          description: 'Sacrament meetings, bishopric agenda, and callings in one place.',
          theme_color: '#2b5c9e',
          background_color: '#f2f4f7',
          display: 'standalone',
          start_url: '/',
          // PNGs are built from scripts/icons/ by scripts/build-icons.sh.
          icons: [
            { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
            { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          // Long-press menu on the app icon (Android, desktop; iOS ignores these). Everyone gets the
          // same list, so pick pages most people can open; the route guards send anyone else home.
          shortcuts: [
            { name: 'Requests', url: '/requests', icons: [{ src: '/pwa-192.png', sizes: '192x192', type: 'image/png' }] },
            { name: 'Meetings', url: '/agenda', icons: [{ src: '/pwa-192.png', sizes: '192x192', type: 'image/png' }] },
            { name: 'Sacrament meeting', short_name: 'Sacrament', url: '/sacrament', icons: [{ src: '/pwa-192.png', sizes: '192x192', type: 'image/png' }] },
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
            include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/**/*.test.ts', 'scripts/**/*.test.ts'],
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
  }
})
