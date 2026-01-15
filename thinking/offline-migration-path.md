# Offline Sync: Migration Path

This document describes the evolution path from the current simple offline implementation to a full sync engine.

## Current Implementation (Option 2)

Offline-first entry creation + updates with IndexedDB storage and event-based sync.

```
┌─────────────────────────────────────────────────────────────┐
│                      UI Components                           │
│  (NavBar, SyncStatusBanner, ActivityFeed)                   │
├─────────────────────────────────────────────────────────────┤
│                      useSync() hook                          │
│  (isOnline, pendingCount, queueEntry, syncNow)              │
├─────────────────────────────────────────────────────────────┤
│                      SyncContext                             │
│  (React Context providing sync state)                        │
├─────────────────────────────────────────────────────────────┤
│                      SyncService                             │
│  (~200 lines: queue creates + updates, retry, invalidate)   │
├─────────────────────────────────────────────────────────────┤
│                      SyncStore Interface                     │
│  (addPending, getAllPending, removePending, etc.)           │
├─────────────────────────────────────────────────────────────┤
│                      IdbSyncStore                            │
│  (IndexedDB implementation, ~80 lines)                      │
└─────────────────────────────────────────────────────────────┘
```

### Characteristics
- **Scope**: Entry creation + updates (no offline delete/pin)
- **Storage**: IndexedDB via `idb` library
- **Sync**: Event-based (online/focus/visibility)
- **Conflicts**: None (append-only when offline)
- **Complexity**: ~200 lines of sync code

## Future Implementation (Option 3)

Full offline-first with sync engine (RxDB, PowerSync, or TinyBase).

```
┌─────────────────────────────────────────────────────────────┐
│                      UI Components                           │
│  (NavBar, SyncStatusBanner, ActivityFeed)                   │ ← unchanged
├─────────────────────────────────────────────────────────────┤
│                      useSync() hook                          │
│  (isOnline, pendingCount, queueEntry, syncNow)              │ ← same API
├─────────────────────────────────────────────────────────────┤
│                      SyncContext                             │
│  (React Context providing sync state)                        │ ← minimal changes
├─────────────────────────────────────────────────────────────┤
│                      Sync Engine Adapter                     │
│  (Implements SyncStore interface)                            │ ← swap this layer
├─────────────────────────────────────────────────────────────┤
│              RxDB / PowerSync / TinyBase                     │
│  (Full sync engine with conflict resolution)                │
└─────────────────────────────────────────────────────────────┘
```

### Migration Steps

1. **Keep SyncStore interface** - The abstraction allows swapping implementations
2. **Create new adapter** - e.g., `RxdbSyncStore` implementing `SyncStore`
3. **Update SyncContext** - Swap `IdbSyncStore` for new adapter
4. **UI stays the same** - No changes needed to components

## Why This Architecture Works

### The SyncStore Abstraction

```typescript
interface SyncStore {
  init(): Promise<void>;
  addPending(entry: PendingEntry): Promise<void>;
  getAllPending(): Promise<PendingEntry[]>;
  getPending(id: string): Promise<PendingEntry | undefined>;
  updatePending(id: string, updates: Partial<PendingEntry>): Promise<void>;
  removePending(id: string): Promise<void>;
  getPendingCount(): Promise<number>;
  clearAll(): Promise<void>;
}
```

This interface:
- Captures the core operations needed for offline sync
- Is simple enough to implement with IndexedDB (~80 lines)
- Is flexible enough to wrap a sync engine
- Decouples UI from storage implementation

### Layer Isolation

```
UI Layer          → Only knows about useSync() hook
                    No direct IndexedDB or sync engine imports

Context Layer     → Only knows about SyncStore interface
                    Can swap implementations without UI changes

Storage Layer     → Implements SyncStore interface
                    Can be IndexedDB, RxDB, PowerSync, etc.
```

## Sync Engine Options

### RxDB
- **Pros**: Reactive queries, offline-first by design, good TypeScript support
- **Cons**: Learning curve, bundle size (~50kb gzipped)
- **Use case**: Real-time collaboration, complex queries

### PowerSync
- **Pros**: Built for Postgres backends, excellent conflict resolution
- **Cons**: Requires backend changes (Postgres sync rules)
- **Use case**: Multi-device sync, large datasets

### TinyBase
- **Pros**: Small bundle (~5kb), reactive, simple API
- **Cons**: Less mature, fewer features
- **Use case**: Simple offline-first apps

## When to Upgrade

Consider upgrading to Option 3 when:

1. **You need edit/delete offline** - Conflict resolution becomes important
2. **Multi-device sync** - Users access from multiple devices
3. **Real-time collaboration** - Multiple users editing same data
4. **Complex offline queries** - Need reactive local queries
5. **Sync edge cases** - Current event-based sync isn't reliable enough

## Migration Effort Estimate

| Task | Complexity |
|------|------------|
| Choose sync engine | Research |
| Create adapter implementing SyncStore | Medium |
| Update SyncContext initialization | Low |
| Backend changes (if needed, e.g., PowerSync) | Medium-High |
| Testing and edge cases | Medium |
| UI changes | None (if SyncStore interface maintained) |

## Native App Consideration

If you ever move to React Native:

1. **Same patterns apply** - SyncStore interface works in React Native
2. **Better options** - WatermelonDB (optimized for RN), PowerSync has RN SDK
3. **Same UI layer** - React components can be reused with React Native
4. **Better background sync** - Native apps have better background task support

The SyncStore abstraction means you can:
- Keep the same `useSync()` hook API
- Swap `IdbSyncStore` for `WatermelonDbSyncStore`
- Reuse all UI components (with RN equivalents)
