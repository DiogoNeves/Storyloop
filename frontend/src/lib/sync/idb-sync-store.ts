import { openDB, type IDBPDatabase } from "idb";

import type { PendingEntry, PendingEntryUpdate, SyncStore } from "./types";

const DB_NAME = "storyloop-sync";
const DB_VERSION = 2;
const STORE_NAME = "pending-entries";
const UPDATE_STORE_NAME = "pending-entry-updates";

interface StoryloopSyncDB {
  "pending-entries": {
    key: string;
    value: PendingEntry;
    indexes: { "by-queued-at": number };
  };
  "pending-entry-updates": {
    key: string;
    value: PendingEntryUpdate;
    indexes: { "by-queued-at": number };
  };
}

/**
 * IndexedDB implementation of SyncStore.
 *
 * Uses the `idb` library for a clean, promise-based IndexedDB API.
 * Stores pending entries with an index on queuedAt for ordered retrieval.
 */
export class IdbSyncStore implements SyncStore {
  private db: IDBPDatabase<StoryloopSyncDB> | null = null;

  async init(): Promise<void> {
    this.db = await openDB<StoryloopSyncDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("by-queued-at", "queuedAt");
        }

        if (!db.objectStoreNames.contains(UPDATE_STORE_NAME)) {
          const store = db.createObjectStore(UPDATE_STORE_NAME, {
            keyPath: "id",
          });
          store.createIndex("by-queued-at", "queuedAt");
        }
      },
    });
  }

  private ensureDb(): IDBPDatabase<StoryloopSyncDB> {
    if (!this.db) {
      throw new Error("SyncStore not initialized. Call init() first.");
    }
    return this.db;
  }

  async addPending(entry: PendingEntry): Promise<void> {
    const db = this.ensureDb();
    await db.put(STORE_NAME, entry);
  }

  async getAllPending(): Promise<PendingEntry[]> {
    const db = this.ensureDb();
    const entries = await db.getAllFromIndex(STORE_NAME, "by-queued-at");
    return entries as PendingEntry[];
  }

  async getPending(id: string): Promise<PendingEntry | undefined> {
    const db = this.ensureDb();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const entry: PendingEntry | undefined = await db.get(STORE_NAME, id);
    return entry;
  }

  /**
   * Update a pending entry atomically using a transaction.
   * Prevents race conditions from concurrent read-modify-write operations.
   */
  async updatePending(
    id: string,
    updates: Partial<PendingEntry>,
  ): Promise<void> {
    const db = this.ensureDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const existing = (await store.get(id)) as PendingEntry | undefined;
    if (existing) {
      await store.put({ ...existing, ...updates });
    }
    await tx.done;
  }

  async removePending(id: string): Promise<void> {
    const db = this.ensureDb();
    await db.delete(STORE_NAME, id);
  }

  async getPendingCount(): Promise<number> {
    const db = this.ensureDb();
    return db.count(STORE_NAME);
  }

  async clearAll(): Promise<void> {
    const db = this.ensureDb();
    await db.clear(STORE_NAME);
    await db.clear(UPDATE_STORE_NAME);
  }

  async addPendingUpdate(update: PendingEntryUpdate): Promise<void> {
    const db = this.ensureDb();
    await db.put(UPDATE_STORE_NAME, update);
  }

  async getAllPendingUpdates(): Promise<PendingEntryUpdate[]> {
    const db = this.ensureDb();
    const updates = await db.getAllFromIndex(
      UPDATE_STORE_NAME,
      "by-queued-at",
    );
    return updates as PendingEntryUpdate[];
  }

  async getPendingUpdate(id: string): Promise<PendingEntryUpdate | undefined> {
    const db = this.ensureDb();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const update: PendingEntryUpdate | undefined = await db.get(
      UPDATE_STORE_NAME,
      id,
    );
    return update;
  }

  async updatePendingUpdate(
    id: string,
    updates: Partial<PendingEntryUpdate>,
  ): Promise<void> {
    const db = this.ensureDb();
    const tx = db.transaction(UPDATE_STORE_NAME, "readwrite");
    const store = tx.objectStore(UPDATE_STORE_NAME);

    const existing = (await store.get(id)) as PendingEntryUpdate | undefined;
    if (existing) {
      await store.put({ ...existing, ...updates });
    }
    await tx.done;
  }

  async removePendingUpdate(id: string): Promise<void> {
    const db = this.ensureDb();
    await db.delete(UPDATE_STORE_NAME, id);
  }

  async getPendingUpdateCount(): Promise<number> {
    const db = this.ensureDb();
    return db.count(UPDATE_STORE_NAME);
  }
}
