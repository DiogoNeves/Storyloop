# Issue: Missing Error Boundary for IndexedDB Failures

**Severity:** Medium
**File:** `frontend/src/App.tsx`, `frontend/src/context/SyncProvider.tsx`

## Problem

The app wraps with `SyncProvider` which initializes IndexedDB, but there's no error handling if IndexedDB initialization fails.

IndexedDB can fail in several scenarios:
- **Safari Private Browsing**: IndexedDB throws quota errors immediately
- **Storage Quota Exceeded**: User's device is full
- **Corrupted Database**: Browser database corruption
- **Disabled by User**: Some privacy extensions block IndexedDB

If initialization fails, the app may crash or behave unexpectedly.

## Suggestion

Add graceful degradation when IndexedDB is unavailable:

```tsx
// In SyncProvider.tsx
const [isIndexedDBAvailable, setIsIndexedDBAvailable] = useState(true);

useEffect(() => {
  const checkIndexedDB = async () => {
    try {
      await syncStore.initialize();
    } catch (error) {
      console.warn('IndexedDB unavailable, offline sync disabled:', error);
      setIsIndexedDBAvailable(false);
    }
  };
  checkIndexedDB();
}, []);

// Provide fallback context value when unavailable
```

Also consider:
- Showing a non-blocking toast when offline sync is unavailable
- Disabling offline-related UI elements gracefully
- Adding an error boundary component around SyncProvider
