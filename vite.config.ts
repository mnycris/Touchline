import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // relative paths: the build works at any URL (root, /Touchline/, a renamed repo, a fork)
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Touchline — Manager Career',
        short_name: 'Touchline',
        description: 'Mobile football manager career with real EA SPORTS FC 27 ratings and the real 2026/27 season.',
        theme_color: '#05070c',
        background_color: '#05070c',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // app shell, fonts, database, crests, competition logos and flags are all available offline
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,webp,json}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // official EA headshots (FC 27 FUT Web App portraits, ratings-site photos), PlayStyle icons and crests; SoFIFA
            // and FUTBIN/FUTWIZ mirrors; football-logos.cc crests; Wikipedia photos
            urlPattern: /^https:\/\/((ratings-images-prod\.pulse\.ea\.com|drop-assets\.ea\.com|cdn\.sofifa\.net|cdn\.futwiz\.com|cdn\.futbin\.com|assets\.football-logos\.cc|upload\.wikimedia\.org)\/|www\.ea\.com\/ea-sports-fc\/ultimate-team\/web-app\/content\/).*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'football-images',
              // opaque cross-origin images count heavily against quota: cap entries and purge instead of failing
              expiration: { maxEntries: 2500, maxAgeSeconds: 60 * 60 * 24 * 120, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/en\.wikipedia\.org\/api\/rest_v1\/page\/summary\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'wiki-summaries', expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 60 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 1200 },
})
