# Offline-First Entry Creation

## Goals
- Allow users to create journal entries while offline (iOS Safari PWA).
- Allow users to edit existing journal entries while offline (queue updates locally).
- Store pending entries in IndexedDB and sync when back online.
- Show cached entries from the last online session when offline.
- Provide clear visual feedback for offline state and pending sync status.
- Design an abstraction layer that enables future migration to sync engines (RxDB, PowerSync).

## Non-goals (for now)
- Deleting or pinning entries while offline.
- Offline support for conversations/Loopie.
- Background Sync API (not supported on iOS Safari).
- Conflict resolution for concurrent edits.
- Full offline-first architecture for all data.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         React App                            │
├─────────────────────────────────────────────────────────────┤
│  SyncProvider                                                │
│  ├── isOnline (navigator.onLine + events)                   │
│  ├── pendingCount                                           │
│  ├── queueEntry() ─────► IdbSyncStore                       │
│  └── syncNow() ─────────► SyncService ────► API             │
├─────────────────────────────────────────────────────────────┤
│  TanStack Query (cached entries via StaleWhileRevalidate)   │
├─────────────────────────────────────────────────────────────┤
│  Service Worker (Workbox)                                    │
│  ├── Static assets: CacheFirst                              │
│  └── /entries API: StaleWhileRevalidate                     │
└─────────────────────────────────────────────────────────────┘
```

## SyncStore Interface

The `SyncStore` interface abstracts the underlying storage mechanism, allowing future migration to RxDB or PowerSync without changing the UI layer.

```typescript
interface PendingEntry {
  id: string;
  data: CreateEntryInput;
  queuedAt: number;
  attempts: number;
  status: 'pending' | 'syncing' | 'failed';
  lastError?: string;
}

interface PendingEntryUpdate {
  id: string;
  data: UpdateEntryInput;
  queuedAt: number;
  attempts: number;
  status: 'pending' | 'syncing' | 'failed';
  lastError?: string;
}

interface SyncStore {
  init(): Promise<void>;
  addPending(entry: PendingEntry): Promise<void>;
  getAllPending(): Promise<PendingEntry[]>;
  getPending(id: string): Promise<PendingEntry | undefined>;
  updatePending(id: string, updates: Partial<PendingEntry>): Promise<void>;
  removePending(id: string): Promise<void>;
  getPendingCount(): Promise<number>;
  addPendingUpdate(entry: PendingEntryUpdate): Promise<void>;
  getAllPendingUpdates(): Promise<PendingEntryUpdate[]>;
  getPendingUpdate(id: string): Promise<PendingEntryUpdate | undefined>;
  updatePendingUpdate(id: string, updates: Partial<PendingEntryUpdate>): Promise<void>;
  removePendingUpdate(id: string): Promise<void>;
  getPendingUpdateCount(): Promise<number>;
  clearAll(): Promise<void>;
}
```

## IndexedDB Schema

Database: `storyloop-sync` (version 2)

### Object Store: `pending-entries`
- Key path: `id`
- Indexes:
  - `by-queued-at` on `queuedAt` (for ordering)

### Entry Shape
```typescript
{
  id: string;          // Entry ID (UUID)
  data: {
    id: string;
    title: string;
    summary: string;
    date: string;
    category: "journal";
  };
  queuedAt: number;    // Timestamp for ordering
  attempts: number;    // Retry count (max 3)
  status: string;      // 'pending' | 'syncing' | 'failed'
  lastError?: string;  // Error message from last failed attempt
}
```

### Object Store: `pending-entry-updates`
- Key path: `id`
- Indexes:
  - `by-queued-at` on `queuedAt` (for ordering)

## Service Worker Strategy

Using `vite-plugin-pwa` with Workbox for service worker generation.

### Static Assets (CacheFirst)
- Pattern: `**/*.{js,css,html,ico,png,svg,woff2}`
- Behavior: Serve from cache, update cache in background
- Enables: App loads instantly, works offline

### API Caching (StaleWhileRevalidate)
- Pattern: `/entries$`
- Cache name: `entries-cache`
- Expiration: 50 entries, 1 day max age
- Behavior: Return cached response immediately, fetch fresh data in background

### YouTube Thumbnails (CacheFirst)
- Pattern: `^https://i.ytimg.com/`
- Cache name: `youtube-thumbnails`
- Expiration: 100 images, 7 days max age

## Sync Triggers

Since Background Sync API is not available on iOS Safari, we use event-based triggers:

1. **`online` event**: Sync when network becomes available
2. **`focus` event**: Sync when window regains focus
3. **`visibilitychange` event**: Sync when document becomes visible

```typescript
// Event registration in SyncContext
window.addEventListener('online', () => syncService.syncAll());
window.addEventListener('focus', () => {
  if (navigator.onLine) syncService.syncAll();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && navigator.onLine) {
    syncService.syncAll();
  }
});
```

## Sync Service Logic

```
syncAll():
  1. Check if already syncing → return
  2. Check if offline → return
  3. Get all pending entries + pending updates ordered by queuedAt
  4. For each entry create:
     a. If attempts >= 3 → skip (mark as failed)
     b. Mark status = 'syncing'
     c. Call createEntry API
     d. On success → remove from IndexedDB
     e. On error → increment attempts, set lastError
  5. For each entry update (after creates, skipping IDs still pending create):
     a. If attempts >= 3 → skip (mark as failed)
     b. Mark status = 'syncing'
     c. Call updateEntry API
     d. On success → remove from IndexedDB
     e. On error → increment attempts, set lastError
  6. Invalidate TanStack Query cache (entries list)
  7. Fire onSyncComplete callback
```

## UI Behavior

### Offline Indicator (NavBar)
- Location: Next to logo in NavBar
- Icon: `WifiOff` from lucide-react
- Style: Muted color, subtle but noticeable
- Tooltip: "You are offline"
- Visibility: Only when `navigator.onLine === false`

### Sync Status Banner
- Location: Below NavBar
- Visibility: Only when `pendingCount > 0`
- Content: "{n} pending {entry/entries} to sync"
- Action: "Sync now" button (triggers manual sync)
- Icon: `CloudOff` + `RefreshCw` (spinning when syncing)

### Pending Sync Badge (ActivityFeedItem)
- Location: On entry card in feed
- Style: Small amber badge
- Content: "Pending sync" with CloudOff icon
- Visibility: When entry.id is in pendingEntries list

### Delete/Pin Buttons (Offline)
- State: Disabled (greyed out)
- Tooltip: "You are offline"
- Applies to: Delete and Pin buttons in ActivityFeedItem and journal detail header

## Entry Creation Flow

```
User submits new entry:
  │
  ├─► Online?
  │   ├─► Yes: Call createEntry API (existing behavior)
  │   │       └─► On success: Add to TanStack Query cache
  │   │
  │   └─► No: Queue entry for offline sync
  │           ├─► Generate UUID for entry
  │           ├─► Store in IndexedDB via SyncStore
  │           ├─► Add optimistically to TanStack Query cache
  │           └─► Show with "Pending sync" badge
  │
  └─► Clear draft form
```

### Online-only create for `/journals/new`

- The `/journals/new` route keeps the content editor read-only until an entry is created.
- The Create button is disabled offline and shows the tooltip copy: "Go online to create".

## Testing Strategy

### Unit Tests
- `IdbSyncStore`: CRUD operations, ordering, error handling
- `SyncService`: Queue/sync flow, retry logic, error handling
- Use `fake-indexeddb` for IndexedDB mocking

### Manual Testing
1. Chrome DevTools offline mode: create entry, go online, verify sync
2. Chrome DevTools offline mode: edit entry, go online, verify update sync
3. iOS Safari PWA: add to home screen, test offline creation
4. Service worker: verify app loads offline
5. Cache invalidation: verify fresh data fetched on sync

## Open Questions (resolved)
- Use event-based sync (online/focus/visibility) instead of Background Sync API
- Show cached entries + pending entries when offline
- Disable (grey out) edit/delete buttons with tooltip when offline
- SyncStore abstraction for future RxDB/PowerSync migration
