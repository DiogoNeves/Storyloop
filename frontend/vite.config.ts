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
    dedupe: [
      "@milkdown/core",
      "@milkdown/ctx",
      "@milkdown/utils",
      "@milkdown/prose",
    ],
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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("/react/") || id.includes("/react-dom/")) {
            return "vendor-react";
          }
          if (id.includes("@tanstack/react-query")) {
            return "vendor-tanstack";
          }
          if (
            id.includes("@radix-ui/") ||
            id.includes("class-variance-authority") ||
            id.includes("tailwind-merge") ||
            id.includes("clsx")
          ) {
            return "vendor-ui";
          }
          if (
            id.includes("react-router-dom") ||
            id.includes("@remix-run/router")
          ) {
            return "vendor-router";
          }
          if (
            id.includes("@milkdown/") ||
            id.includes("prosemirror") ||
            id.includes("@codemirror/")
          ) {
            return "vendor-editor";
          }
          if (
            id.includes("react-markdown") ||
            id.includes("remark-") ||
            id.includes("rehype-") ||
            id.includes("mdast-") ||
            id.includes("micromark")
          ) {
            return "vendor-markdown";
          }
          if (id.includes("lucide-react")) {
            return "vendor-icons";
          }

          return undefined;
        },
      },
    },
  },
});
