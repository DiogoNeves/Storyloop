import { createQueryKeys } from "@lukemorales/query-key-factory";

import { apiClient } from "@/api/client";

export interface Entry {
  id: string;
  title: string;
  summary: string;
  date: string;
  category: "video" | "insight" | "journal";
  linkUrl?: string | null;
  thumbnailUrl?: string | null;
  videoId?: string | null;
}

export interface CreateEntryInput {
  id: string;
  title: string;
  summary: string;
  date: string;
  category: Entry["category"];
  linkUrl?: string | null;
  thumbnailUrl?: string | null;
  videoId?: string | null;
}

export interface UpdateEntryInput extends Partial<CreateEntryInput> {
  id: string;
}

export const entriesQueries = createQueryKeys("entries", {
  all: () => ({
    queryKey: ["entries"],
    queryFn: async (): Promise<Entry[]> => {
      const { data } = await apiClient.get<Entry[]>("/entries");
      return data;
    },
  }),
  byId: (id: string) => ({
    queryKey: ["entries", id],
    queryFn: async (): Promise<Entry> => {
      const { data } = await apiClient.get<Entry>(`/entries/${id}`);
      return data;
    },
  }),
});

export async function createEntry(input: CreateEntryInput): Promise<Entry | null> {
  const { data } = await apiClient.post<Entry[]>("/entries", [input]);
  return data.length > 0 ? data[0] : null;
}

export async function updateEntry({ id, ...input }: UpdateEntryInput): Promise<Entry> {
  const { data } = await apiClient.put<Entry>(`/entries/${id}`, input);
  return data;
}

export async function deleteEntry(id: string): Promise<void> {
  await apiClient.delete(`/entries/${id}`);
}

export const entriesMutations = {
  create: () => ({
    mutationFn: createEntry,
  }),
  update: () => ({
    mutationFn: updateEntry,
  }),
  delete: () => ({
    mutationFn: deleteEntry,
  }),
};

