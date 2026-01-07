# Issue: Bundle Size Increase

**Severity:** Medium
**Build Warning:**
```
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit
✓ built in 1.56s
```

## New Dependencies Added

| Package | Size (gzip) | Purpose |
|---------|-------------|---------|
| `idb` | ~3.4 KB | IndexedDB wrapper |
| `vite-plugin-pwa` | Dev only | PWA build tooling |
| `workbox-window` | ~2 KB | Service worker runtime |
| `@radix-ui/react-tooltip` | ~8 KB | Tooltip component |

## Impact

The chunk size warning indicates the main bundle has grown beyond the 500 KB threshold. This affects:
- Initial page load time
- Mobile users on slow connections
- Lighthouse performance score

## Suggestions

### 1. Code Splitting with Dynamic Imports

Lazy-load the sync infrastructure since it's not needed immediately:

```typescript
// Lazy load sync provider
const SyncProvider = lazy(() => import('./context/SyncProvider'));

// In App.tsx
<Suspense fallback={null}>
  <SyncProvider>
    {/* ... */}
  </SyncProvider>
</Suspense>
```

### 2. Manual Chunks Configuration

Split vendor libraries into separate chunks in `vite.config.ts`:

```typescript
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react': ['react', 'react-dom'],
        'vendor-radix': ['@radix-ui/react-tooltip', '@radix-ui/react-switch'],
        'vendor-sync': ['idb', 'workbox-window'],
      },
    },
  },
},
```

### 3. Analyze Bundle

Run bundle analysis to identify the largest contributors:

```bash
pnpm add -D rollup-plugin-visualizer
```

```typescript
// vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer';

plugins: [
  visualizer({ open: true, gzipSize: true }),
]
```

### 4. Consider Tree-Shaking

Ensure imports are specific:
```typescript
// Instead of
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@radix-ui/react-tooltip';

// Use (if supported)
import { Tooltip } from '@radix-ui/react-tooltip/dist/Tooltip';
```

## Acceptance Criteria

- [ ] Bundle size warning resolved or threshold adjusted with justification
- [ ] Main chunk under 500 KB (or documented exception)
- [ ] Lazy loading implemented for non-critical features
