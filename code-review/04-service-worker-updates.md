# Issue: Service Worker Update Handling

**Severity:** Low
**File:** `frontend/src/main.tsx`, `frontend/vite.config.ts`

## Problem

Service worker updates need careful handling to avoid breaking user sessions. Key concerns:

1. **Stale Cache**: Users might see old cached content after deployment
2. **Update Prompt**: Users should be notified when a new version is available
3. **Force Refresh**: Some updates may require a hard refresh

## Review Points

Verify the following in the current implementation:

- [ ] `vite-plugin-pwa` is configured with `registerType: 'prompt'` or similar for controlled updates
- [ ] Users are notified when a new version is available
- [ ] Critical updates can force a refresh
- [ ] Service worker doesn't cache API responses that should always be fresh

## Suggestion

If not already implemented, consider adding an update prompt:

```typescript
// In main.tsx or a dedicated hook
import { registerSW } from 'virtual:pwa-register';

const updateSW = registerSW({
  onNeedRefresh() {
    // Show toast: "New version available. Refresh to update."
    if (confirm('New version available. Reload?')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log('App ready for offline use');
  },
});
```

Also ensure `workbox` runtime caching strategies are appropriate:
- `NetworkFirst` for API calls
- `CacheFirst` for static assets
- `StaleWhileRevalidate` for less critical resources
