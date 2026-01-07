import { openDB, type IDBPDatabase } from "idb";

import type { PendingEntry, SyncStore } from "./types";

const DB_NAME = "storyloop-sync";
const DB_VERSION = 1;
const STORE_NAME = "pending-entries";

interface StoryloopSyncDB {
  "pending-entries": {
    key: string;
    value: PendingEntry;
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
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("by-queued-at", "queuedAt");
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

  async updatePending(
    id: string,
    updates: Partial<PendingEntry>,
  ): Promise<void> {
    const db = this.ensureDb();
    const existing = (await db.get(STORE_NAME, id)) as PendingEntry | undefined;
    if (existing) {
      await db.put(STORE_NAME, { ...existing, ...updates });
    }
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
  }
}
