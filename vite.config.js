import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'
import process from 'node:process'

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production';
  const base = isProd ? '/Simple-Fuel-Tracker-Dev/' : '/';
  const shouldAnalyze = process.env.ANALYZE === 'true';

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      shouldAnalyze && visualizer({
        filename: 'bundle-analysis.html',
        gzipSize: true,
        brotliSize: true,
        template: 'treemap',
        open: false
      }),
      shouldAnalyze && visualizer({
        filename: 'bundle-analysis-data.json',
        gzipSize: true,
        brotliSize: true,
        template: 'raw-data',
        open: false
      }),
      !shouldAnalyze && VitePWA({
        registerType: 'prompt',
        cacheId: 'simple-fuel-tracker-dev',
        includeAssets: [
          'icon.png',
          'favicon.svg',
          'ios/*.png',
          'background-removal/**/*'
        ],
        manifest: {
          id: 'simple-fuel-tracker-dev',
          name: 'Simple Fuel Tracker Dev',
          short_name: 'FuelDev',
          description: 'Development build for Simple Fuel Tracker',
          theme_color: '#10b981',
          background_color: '#0f172a',
          display: 'standalone',
          start_url: '.',
          scope: '.',
          orientation: 'portrait',
          categories: ['utilities', 'productivity'],
          icons: [
            {
              src: 'ios/180.png',
              sizes: '180x180',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'ios/192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'ios/512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'ios/1024.png',
              sizes: '1024x1024',
              type: 'image/png',
              purpose: 'any'
            }
          ]
        },
        workbox: {
          cleanupOutdatedCaches: true,
          maximumFileSizeToCacheInBytes: 100 * 1024 * 1024,
          globPatterns: [
            '**/*.{js,css,html,ico,png,svg,webp,jpg,jpeg,woff2,wasm,onnx,json,bin,data,mjs}'
          ],
          runtimeCaching: [
            {
              urlPattern: /\/assets\/ort\..*\.(?:js|mjs|wasm)$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'sft-dev-onnxruntime-cache',
                expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] }
              }
            },
            {
              urlPattern: /\/background-removal\/.+/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'sft-dev-background-removal-cache',
                expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] }
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'sft-dev-google-fonts-cache',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] }
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'sft-dev-google-fonts-webfonts-cache',
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] }
              }
            }
          ]
        }
      })
    ],
    esbuild: isProd ? {
      drop: ['debugger']
    } : {},
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '0.0.0'),
      __APP_BUILD_NUMBER__: JSON.stringify(process.env.VITE_APP_BUILD_NUMBER || process.env.GITHUB_RUN_NUMBER || ''),
      __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString())
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-charts': ['chart.js', 'react-chartjs-2'],
            'vendor-ui': ['lucide-react', 'framer-motion', 'clsx', 'tailwind-merge'],
            'vendor-bg-removal': ['@imgly/background-removal', 'onnxruntime-web']
          }
        }
      },
      chunkSizeWarningLimit: 1500
    }
  };
});
