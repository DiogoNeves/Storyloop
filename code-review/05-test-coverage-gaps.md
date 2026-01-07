# Issue: Test Coverage Gaps

**Severity:** Medium
**Files:** `frontend/tests/sync/`

## Current State

The PR includes 45 unit tests covering:
- `idb-sync-store.test.ts` - IndexedDB operations
- `sync-service.test.ts` - Sync service logic

## Missing Test Coverage

### 1. Integration Tests: Offline → Online Transition
No tests verify the full flow:
```
Create entry offline → Go online → Entry syncs → UI updates
```

### 2. Service Worker Behavior
- Cache invalidation on deployment
- Offline asset serving
- API request caching/bypass

### 3. Error States
- Network failure during sync (partial sync)
- IndexedDB quota exceeded
- Concurrent sync attempts
- API returning 4xx/5xx errors

### 4. Edge Cases
- Creating entries while sync is in progress
- Rapid online/offline toggling
- Browser tab backgrounding during sync

## Suggestions

### Add Integration Test
```typescript
describe('Offline to Online Sync', () => {
  it('syncs pending entries when coming online', async () => {
    // 1. Mock navigator.onLine = false
    // 2. Create entry via UI/hook
    // 3. Verify entry in IndexedDB with status 'pending'
    // 4. Mock navigator.onLine = true, dispatch 'online' event
    // 5. Verify API called
    // 6. Verify entry removed from pending queue
  });
});
```

### Add Error State Tests
```typescript
describe('Sync Error Handling', () => {
  it('retries failed syncs up to 3 times', async () => { /* ... */ });
  it('marks entry as failed after max retries', async () => { /* ... */ });
  it('handles quota exceeded gracefully', async () => { /* ... */ });
});
```

### Consider E2E Test
Add a Playwright test that:
1. Enables offline mode in DevTools
2. Creates an entry
3. Disables offline mode
4. Verifies sync completion
