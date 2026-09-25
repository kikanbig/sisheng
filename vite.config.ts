import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

function sceneList(): Plugin {
  const virtual = '\0virtual:scenes'
  const source = () => {
    const dir = path.resolve('public/art/scenes')
    const files = fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((name) => name.endsWith('.webp'))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      : []
    return `export const SCENES = ${JSON.stringify(files.map((name) => `/art/scenes/${name}`))}`
  }
  return {
    name: 'scene-list',
    resolveId(id) {
      if (id === 'virtual:scenes') return virtual
    },
    load(id) {
      if (id === virtual) return source()
    },
  }
}

export default defineConfig({
  plugins: [
    sceneList(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Sisheng — 四声',
        short_name: 'Sisheng',
        description: 'Карточки, тоны и живое произношение путунхуа',
        lang: 'ru',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f3ead7',
        theme_color: '#f3ead7',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        globIgnores: ['**/art/scenes/**'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /\/art\/scenes\/\d+\.webp$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'scenes',
              expiration: { maxEntries: 48, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/hanzi-writer-data.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'strokes',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 180 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
})
