import { createQueryKeys } from "@lukemorales/query-key-factory";
import {
  type QueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";

import { API_BASE_URL, apiClient } from "@/api/client";
import { compareEntriesByPinnedDate, type Entry } from "@/lib/types/entries";

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
export type { Entry };

export interface CreateEntryInput {
  id: string;
  title: string;
  summary: string;
  date: string;
  category: Entry["category"];
  promptBody?: string | null;
  promptFormat?: string | null;
  linkUrl?: string | null;
  thumbnailUrl?: string | null;
  pinned?: boolean;
  archived?: boolean;
}

export interface UpdateEntryInput extends Partial<CreateEntryInput> {
  id: string;
}

export interface EntriesMutationContext {
  previousEntries?: Entry[];
  previousById?: Entry;
  id?: string;
}

interface MutationCallbacks<TData, TVariables> {
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
    error: unknown,
    variables: TVariables | undefined,
    context: EntriesMutationContext | undefined,
  ) => void;
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
  create: (
    queryClient: QueryClient,
    callbacks?: MutationCallbacks<Entry | null, CreateEntryInput>,
  ): UseMutationOptions<
    Entry | null,
    unknown,
    CreateEntryInput,
    EntriesMutationContext
  > => ({
    mutationFn: createEntry,
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
      const optimisticUpdatedAt = new Date().toISOString();

      const applyPatch = (entry: Entry) =>
        applyEntryPatch(entry, input, optimisticUpdatedAt);
      const nextEntries = (previousEntries ?? []).map((entry) =>
        entry.id === input.id ? applyPatch(entry) : entry,
      );

      if (previousEntries) {
        queryClient.setQueryData<Entry[]>(
          listKey,
          [...nextEntries].sort(compareEntriesByPinnedDate),
        );
      }

      if (previousById) {
        queryClient.setQueryData<Entry>(
          byIdQuery.queryKey,
          applyPatch(previousById),
        );
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
      const listQuery = entriesQueries.all();

      queryClient.setQueryData<Entry[] | undefined>(
        listQuery.queryKey,
        (previousEntries) => {
          if (!previousEntries) {
            return previousEntries;
          }

          const nextEntries = previousEntries.map((entry) =>
            entry.id === data.id ? data : entry,
          );
          return [...nextEntries].sort(compareEntriesByPinnedDate);
        },
      );

      const byIdQuery = entriesQueries.byId(data.id);
      queryClient.setQueryData<Entry>(byIdQuery.queryKey, data);

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

function applyEntryPatch(
  entry: Entry,
  input: UpdateEntryInput,
  updatedAt: string,
): Entry {
  const nextArchived =
    "archived" in input ? Boolean(input.archived) : Boolean(entry.archived);
  const archivedAt =
    "archived" in input
      ? nextArchived
        ? entry.archivedAt ?? updatedAt
        : null
      : entry.archivedAt ?? null;

  return {
    ...entry,
    ...("title" in input ? { title: input.title! } : {}),
    ...("summary" in input ? { summary: input.summary! } : {}),
    ...("date" in input ? { date: input.date! } : {}),
    ...("promptBody" in input
      ? { promptBody: input.promptBody ?? null }
      : {}),
    ...("promptFormat" in input
      ? { promptFormat: input.promptFormat ?? null }
      : {}),
    ...("pinned" in input ? { pinned: input.pinned! } : {}),
    ...("archived" in input ? { archived: input.archived! } : {}),
    archivedAt,
    updatedAt,
  };
}

export interface SmartEntryStreamCallbacks {
  onOpen?: () => void;
  onToken?: (token: string) => void;
  onDone?: (payload: { entryId?: string; text?: string }) => void;
  onError?: (message: string) => void;
  onToolCall?: (message: string) => void;
}

export interface StreamSmartEntryOptions {
  entryId: string;
  signal?: AbortSignal;
  callbacks?: SmartEntryStreamCallbacks;
}

interface ParsedSseEvent {
  event: string | null;
  data: unknown;
}

function parseSseEvent(rawEvent: string): ParsedSseEvent | null {
  const lines = rawEvent.split(/\r?\n/);
  let eventName: string | null = null;
  const dataLines: string[] = [];

  for (const rawLine of lines) {
    if (!rawLine) {
      continue;
    }
    if (rawLine.startsWith("event:")) {
      eventName = rawLine.slice(6).trim();
      continue;
    }
    if (rawLine.startsWith("data:")) {
      dataLines.push(rawLine.slice(5).trim());
    }
  }

  if (!eventName && dataLines.length === 0) {
    return null;
  }

  const dataPayload = dataLines.join("\n");
  let parsedData: unknown = dataPayload;
  if (dataPayload.length > 0) {
    try {
      parsedData = JSON.parse(dataPayload);
    } catch {
      parsedData = dataPayload;
    }
  }

  return { event: eventName, data: parsedData };
}

function handleSmartEntryEvent(
  parsed: ParsedSseEvent,
  callbacks: SmartEntryStreamCallbacks | undefined,
): boolean {
  const { onToken, onDone, onError } = callbacks ?? {};

  switch (parsed.event) {
    case "token": {
      const token =
        typeof parsed.data === "object" && parsed.data !== null
          ? (parsed.data as Record<string, unknown>).token
          : undefined;
      if (typeof token === "string") {
        onToken?.(token);
      }
      return false;
    }
    case "done": {
      const record =
        typeof parsed.data === "object" && parsed.data !== null
          ? (parsed.data as Record<string, unknown>)
          : {};
      const entryId =
        typeof record.entry_id === "string" ? record.entry_id : undefined;
      const text = typeof record.text === "string" ? record.text : undefined;
      onDone?.({ entryId, text });
      return true;
    }
    case "error": {
      const message =
        typeof parsed.data === "object" && parsed.data !== null
          ? (parsed.data as Record<string, unknown>).message
          : undefined;
      const resolvedMessage =
        typeof message === "string"
          ? message
          : "Loopie couldn't update this smart entry.";
      onError?.(resolvedMessage);
      return true;
    }
    case "tool_call": {
      const message =
        typeof parsed.data === "object" && parsed.data !== null
          ? (parsed.data as Record<string, unknown>).message
          : undefined;
      if (typeof message === "string") {
        callbacks?.onToolCall?.(message);
      }
      return false;
    }
    default:
      return false;
  }
}

export async function streamSmartEntryUpdate(
  options: StreamSmartEntryOptions,
): Promise<void> {
  const { entryId, signal, callbacks } = options;
  const response = await fetch(`${API_BASE_URL}/entries/${entryId}/smart/stream`, {
    method: "POST",
    headers: {
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
    },
    signal,
    mode: "cors",
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    const error = new Error(
      errorText || `Failed to stream smart entry update (status ${response.status}).`,
    ) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Streaming is not supported in this environment.");
  }

  callbacks?.onOpen?.();

  const decoder = new TextDecoder();
  let buffer = "";
  let shouldStop = false;

  const boundaryPattern = /\r?\n\r?\n/g;

  const findBoundary = (input: string) => {
    boundaryPattern.lastIndex = 0;
    return boundaryPattern.exec(input);
  };

  try {
    while (!shouldStop) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      let match = findBoundary(buffer);
      while (match) {
        const boundaryIndex = match.index ?? -1;
        if (boundaryIndex === -1) {
          break;
        }

        const rawEvent = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + match[0].length);

        const parsed = parseSseEvent(rawEvent);
        if (parsed) {
          shouldStop = handleSmartEntryEvent(parsed, callbacks) || shouldStop;
        }

        match = findBoundary(buffer);
      }
    }

    if (!shouldStop && buffer.trim().length > 0) {
      const parsed = parseSseEvent(buffer);
      if (parsed) {
        shouldStop = handleSmartEntryEvent(parsed, callbacks) || shouldStop;
      }
    }
  } finally {
    if (shouldStop) {
      try {
        await reader.cancel();
      } catch {
        // Ignore cancellation errors
      }
    }
  }
}
