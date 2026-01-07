# Issue: Potential Race Condition in Sync Service

**Severity:** High
**File:** `frontend/src/lib/sync/sync-service.ts`

## Problem

If `processPendingEntries()` is called rapidly (e.g., multiple visibility/focus events firing in quick succession), concurrent sync operations could occur. This may lead to:

- Duplicate API calls for the same entry
- Inconsistent state between IndexedDB and server
- Wasted bandwidth and API rate limiting issues

## Scenario

1. User switches tabs (visibility event fires)
2. `processPendingEntries()` starts syncing entry A
3. User clicks back to tab (focus event fires)
4. Another `processPendingEntries()` starts, also tries to sync entry A
5. Both succeed, but entry A is synced twice

## Suggestion

Add a synchronization lock:

```typescript
class SyncService {
  private isSyncing = false;

  async processPendingEntries(): Promise<SyncResult> {
    if (this.isSyncing) {
      return { synced: 0, failed: 0, pending: await this.store.getPendingCount() };
    }

    this.isSyncing = true;
    try {
      // ... existing sync logic
    } finally {
      this.isSyncing = false;
    }
  }
}
```

Alternatively, use a debounce on the event handlers:

```typescript
const debouncedSync = debounce(() => syncService.processPendingEntries(), 1000);

window.addEventListener('online', debouncedSync);
window.addEventListener('visibilitychange', debouncedSync);
```
