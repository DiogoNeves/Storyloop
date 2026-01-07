import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";

import { IdbSyncStore } from "@/lib/sync/idb-sync-store";
import type { PendingEntry } from "@/lib/sync/types";

describe("IdbSyncStore", () => {
  let store: IdbSyncStore;

  const createPendingEntry = (
    id: string,
    queuedAt: number = Date.now(),
  ): PendingEntry => ({
    id,
    data: {
      id,
      title: `Entry ${id}`,
      summary: "Test summary",
      date: new Date().toISOString(),
      category: "journal",
    },
    queuedAt,
    attempts: 0,
    status: "pending",
  });

  beforeEach(async () => {
    store = new IdbSyncStore();
    await store.init();
  });

  afterEach(async () => {
    await store.clearAll();
  });

  describe("addPending", () => {
    it("should add a pending entry", async () => {
      const entry = createPendingEntry("test-1");
      await store.addPending(entry);

      const retrieved = await store.getPending("test-1");
      expect(retrieved).toEqual(entry);
    });

    it("should update an existing entry with the same id", async () => {
      const entry1 = createPendingEntry("test-1");
      const entry2 = { ...createPendingEntry("test-1"), attempts: 5 };

      await store.addPending(entry1);
      await store.addPending(entry2);

      const retrieved = await store.getPending("test-1");
      expect(retrieved?.attempts).toBe(5);
    });
  });

  describe("getAllPending", () => {
    it("should return empty array when no entries", async () => {
      const entries = await store.getAllPending();
      expect(entries).toEqual([]);
    });

    it("should return all entries ordered by queuedAt", async () => {
      const entry1 = createPendingEntry("test-1", 1000);
      const entry2 = createPendingEntry("test-2", 3000);
      const entry3 = createPendingEntry("test-3", 2000);

      await store.addPending(entry1);
      await store.addPending(entry2);
      await store.addPending(entry3);

      const entries = await store.getAllPending();
      expect(entries.map((e) => e.id)).toEqual(["test-1", "test-3", "test-2"]);
    });
  });

  describe("getPending", () => {
    it("should return undefined for non-existent entry", async () => {
      const entry = await store.getPending("non-existent");
      expect(entry).toBeUndefined();
    });

    it("should return the entry by id", async () => {
      const entry = createPendingEntry("test-1");
      await store.addPending(entry);

      const retrieved = await store.getPending("test-1");
      expect(retrieved).toEqual(entry);
    });
  });

  describe("updatePending", () => {
    it("should update an existing entry", async () => {
      const entry = createPendingEntry("test-1");
      await store.addPending(entry);

      await store.updatePending("test-1", {
        status: "syncing",
        attempts: 2,
        lastError: "Network error",
      });

      const updated = await store.getPending("test-1");
      expect(updated?.status).toBe("syncing");
      expect(updated?.attempts).toBe(2);
      expect(updated?.lastError).toBe("Network error");
    });

    it("should not throw when updating non-existent entry", async () => {
      await expect(
        store.updatePending("non-existent", { status: "syncing" }),
      ).resolves.not.toThrow();
    });
  });

  describe("removePending", () => {
    it("should remove an existing entry", async () => {
      const entry = createPendingEntry("test-1");
      await store.addPending(entry);

      await store.removePending("test-1");

      const retrieved = await store.getPending("test-1");
      expect(retrieved).toBeUndefined();
    });

    it("should not throw when removing non-existent entry", async () => {
      await expect(store.removePending("non-existent")).resolves.not.toThrow();
    });
  });

  describe("getPendingCount", () => {
    it("should return 0 when no entries", async () => {
      const count = await store.getPendingCount();
      expect(count).toBe(0);
    });

    it("should return correct count", async () => {
      await store.addPending(createPendingEntry("test-1"));
      await store.addPending(createPendingEntry("test-2"));
      await store.addPending(createPendingEntry("test-3"));

      const count = await store.getPendingCount();
      expect(count).toBe(3);
    });
  });

  describe("clearAll", () => {
    it("should remove all entries", async () => {
      await store.addPending(createPendingEntry("test-1"));
      await store.addPending(createPendingEntry("test-2"));

      await store.clearAll();

      const count = await store.getPendingCount();
      expect(count).toBe(0);
    });
  });
});
