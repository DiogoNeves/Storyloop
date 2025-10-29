import { createQueryKeys } from "@lukemorales/query-key-factory";

import { apiClient } from "@/api/client";

/**
 * Entry API helpers aligned with the currently implemented backend routes.
 *
 * Supported operations:
 * - `GET /entries` — fetches all stored entries, returning an array of {@link Entry}.
 * - `POST /entries` — accepts an array of entries to persist and returns the subset
 *   that were newly stored.
 *
 * Update, delete, and lookup-by-id endpoints are not yet available; avoid exposing
 * helpers for them until the backend supports those routes.
 */
export interface Entry {
  id: string;
  title: string;
  summary: string;
  date: string;
  category: "video" | "insight" | "journal";
  linkUrl?: string | null;
  thumbnailUrl?: string | null;
}

export interface CreateEntryInput {
  id: string;
  title: string;
  summary: string;
  date: string;
  category: Entry["category"];
  linkUrl?: string | null;
  thumbnailUrl?: string | null;
}

export const entriesQueries = createQueryKeys("entries", {
  /** Fetch all entries ordered by recency, mirroring `GET /entries`. */
  all: () => ({
    queryKey: ["entries"],
    queryFn: async (): Promise<Entry[]> => {
      const { data } = await apiClient.get<Entry[]>("/entries");
      return data;
    },
  }),
});

/** Persist a single entry using the backend's bulk `POST /entries` endpoint. */
export async function createEntry(input: CreateEntryInput): Promise<Entry | null> {
  const { data } = await apiClient.post<Entry[]>("/entries", [input]);
  return data.length > 0 ? data[0] : null;
}

