import { createQueryKeys } from "@lukemorales/query-key-factory";
import {
  type QueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";

import { apiClient } from "@/api/client";

/**
 * Entry API helpers aligned with the currently implemented backend routes.
 *
 * Supported operations:
 * - `GET /entries` — fetches all stored entries, returning an array of {@link Entry}.
 * - `GET /entries/{id}` — fetches a single entry by ID.
 * - `POST /entries` — accepts an array of entries to persist and returns the subset
 *   that were newly stored.
 * - `PUT /entries/{id}` — updates an existing entry.
 * - `DELETE /entries/{id}` — deletes an entry.
 */
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

export interface EntriesMutationContext {
  previousEntries?: Entry[];
  previousById?: Entry;
  id?: string;
}

type MutationCallbacks<TData, TVariables> = {
  onError?: (
    error: unknown,
    variables: TVariables,
    context: EntriesMutationContext | undefined,
  ) => void;
  onSuccess?: (
    data: TData,
    variables: TVariables,
    context: EntriesMutationContext | undefined,
  ) => void;
  onSettled?: (
    data: TData | undefined,
    error: unknown | null,
    variables: TVariables | undefined,
    context: EntriesMutationContext | undefined,
  ) => void;
};

export const entriesQueries = createQueryKeys("entries", {
  /** Fetch all entries ordered by recency, mirroring `GET /entries`. */
  all: () => ({
    queryKey: ["entries"],
    queryFn: async (): Promise<Entry[]> => {
      const { data } = await apiClient.get<Entry[]>("/entries");
      return data;
    },
  }),
  /** Fetch a single entry by ID, mirroring `GET /entries/{id}`. */
  byId: (id: string) => ({
    queryKey: ["entries", id],
    queryFn: async (): Promise<Entry> => {
      const { data } = await apiClient.get<Entry>(`/entries/${id}`);
      return data;
    },
  }),
});

/** Persist a single entry using the backend's bulk `POST /entries` endpoint. */
export async function createEntry(
  input: CreateEntryInput,
): Promise<Entry | null> {
  const { data } = await apiClient.post<Entry[]>("/entries", [input]);
  return data.length > 0 ? data[0] : null;
}

export async function updateEntry({
  id,
  ...input
}: UpdateEntryInput): Promise<Entry> {
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
  update: (
    queryClient: QueryClient,
    callbacks?: MutationCallbacks<Entry, UpdateEntryInput>,
  ): UseMutationOptions<
    Entry,
    unknown,
    UpdateEntryInput,
    EntriesMutationContext
  > => ({
    mutationFn: updateEntry,
    async onMutate(input) {
      const listQuery = entriesQueries.all();
      await queryClient.cancelQueries({ queryKey: listQuery.queryKey });
      const listKey = listQuery.queryKey;
      const previousEntries = queryClient.getQueryData<Entry[]>(listKey);

      const byIdQuery = entriesQueries.byId(input.id);
      await queryClient.cancelQueries({ queryKey: byIdQuery.queryKey });
      const previousById = queryClient.getQueryData<Entry>(byIdQuery.queryKey);

      const nextEntries = (previousEntries ?? []).map((entry) =>
        entry.id === input.id
          ? {
              ...entry,
              ...("title" in input ? { title: input.title! } : {}),
              ...("summary" in input ? { summary: input.summary! } : {}),
              ...("date" in input ? { date: input.date! } : {}),
              ...("videoId" in input ? { videoId: input.videoId ?? null } : {}),
            }
          : entry,
      );

      if (previousEntries) {
        queryClient.setQueryData<Entry[]>(listKey, nextEntries);
      }

      if (previousById) {
        queryClient.setQueryData<Entry>(byIdQuery.queryKey, {
          ...previousById,
          ...("title" in input ? { title: input.title! } : {}),
          ...("summary" in input ? { summary: input.summary! } : {}),
          ...("date" in input ? { date: input.date! } : {}),
          ...("videoId" in input ? { videoId: input.videoId ?? null } : {}),
        });
      }

      return { previousEntries, previousById } satisfies EntriesMutationContext;
    },
    onError(error, variables, context) {
      const listQuery = entriesQueries.all();
      if (context?.previousEntries) {
        queryClient.setQueryData<Entry[]>(
          listQuery.queryKey,
          context.previousEntries,
        );
      }

      if (context?.previousById) {
        const byIdQuery = entriesQueries.byId(variables.id);
        queryClient.setQueryData<Entry>(
          byIdQuery.queryKey,
          context.previousById,
        );
      }

      callbacks?.onError?.(error, variables, context);
    },
    onSuccess(data, variables, context) {
      callbacks?.onSuccess?.(data, variables, context);
    },
    onSettled(data, error, variables, context) {
      const listQuery = entriesQueries.all();
      void queryClient.invalidateQueries({ queryKey: listQuery.queryKey });

      if (variables) {
        const byIdQuery = entriesQueries.byId(variables.id);
        void queryClient.invalidateQueries({ queryKey: byIdQuery.queryKey });
      }

      callbacks?.onSettled?.(data, error, variables, context);
    },
  }),
  delete: (
    queryClient: QueryClient,
    callbacks?: MutationCallbacks<void, string>,
  ): UseMutationOptions<void, unknown, string, EntriesMutationContext> => ({
    mutationFn: deleteEntry,
    async onMutate(id) {
      const listQuery = entriesQueries.all();
      await queryClient.cancelQueries({ queryKey: listQuery.queryKey });
      const listKey = listQuery.queryKey;
      const previousEntries = queryClient.getQueryData<Entry[]>(listKey);

      if (previousEntries) {
        queryClient.setQueryData<Entry[]>(
          listKey,
          previousEntries.filter((entry) => entry.id !== id),
        );
      }

      const byIdQuery = entriesQueries.byId(id);
      await queryClient.cancelQueries({ queryKey: byIdQuery.queryKey });
      const previousById = queryClient.getQueryData<Entry>(byIdQuery.queryKey);
      queryClient.removeQueries({ queryKey: byIdQuery.queryKey, exact: true });

      return {
        previousEntries,
        previousById,
        id,
      } satisfies EntriesMutationContext;
    },
    onError(error, id, context) {
      const listQuery = entriesQueries.all();
      if (context?.previousEntries) {
        queryClient.setQueryData<Entry[]>(
          listQuery.queryKey,
          context.previousEntries,
        );
      }

      if (context?.previousById) {
        const byIdQuery = entriesQueries.byId(id);
        queryClient.setQueryData<Entry>(
          byIdQuery.queryKey,
          context.previousById,
        );
      }

      callbacks?.onError?.(error, id, context);
    },
    onSuccess(data, id, context) {
      callbacks?.onSuccess?.(data, id, context);
    },
    onSettled(data, error, id, context) {
      const listQuery = entriesQueries.all();
      void queryClient.invalidateQueries({ queryKey: listQuery.queryKey });

      if (id) {
        const byIdQuery = entriesQueries.byId(id);
        void queryClient.invalidateQueries({ queryKey: byIdQuery.queryKey });
      }

      callbacks?.onSettled?.(data, error, id, context);
    },
  }),
};
