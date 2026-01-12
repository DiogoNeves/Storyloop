import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "path";

// Backend port for dev proxy (configurable via VITE_BACKEND_PORT env var)
const backendPort = process.env.VITE_BACKEND_PORT ?? "8001";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["storyloop.svg"],
      manifest: false, // Use existing manifest.json in public/
      workbox: {
        // Cache static assets
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],

        // Runtime caching strategies
        runtimeCaching: [
          {
            // Cache API GET entries (stale-while-revalidate)
            // Matches /api/entries (proxy) and /entries (direct) with optional query params
            urlPattern: /\/(api\/)?entries(\?.*)?$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "entries-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 1 day
              },
            },
          },
          {
            // Cache YouTube thumbnails (cache-first)
            urlPattern: /^https:\/\/i\.ytimg\.com\//,
            handler: "CacheFirst",
            options: {
              cacheName: "youtube-thumbnails",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
            },
          },
        ],

        // Skip waiting and claim clients immediately
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./tests/setup.ts",
  },
  server: {
    allowedHosts: true,
    proxy: {
      "/api": {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  envDir: resolve(__dirname, ".."), // Load .env from project root
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-tanstack": ["@tanstack/react-query"],
          "vendor-ui": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-label",
            "@radix-ui/react-slot",
            "@radix-ui/react-switch",
            "@radix-ui/react-tooltip",
          ],
        },
      },
    },
  },
});
