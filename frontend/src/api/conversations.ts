import { createQueryKeys } from "@lukemorales/query-key-factory";

import { apiClient } from "@/api/client";

/**
 * Conversation API for agent interactions with SSE streaming support.
 *
 * Supported operations:
 * - `POST /conversations` — creates a new conversation
 * - `GET /conversations/{id}/turns` — fetches all turns (messages) for a conversation
 * - `POST /conversations/{id}/turns/stream` — streams assistant response via SSE
 */

export interface ConversationOut {
  id: string;
  title: string | null;
  created_at: string;
}

export interface TurnOut {
  id: string;
  role: string;
  text: string;
  created_at: string;
}

export interface TurnInput {
  text: string;
}

export interface ConversationCreateInput {
  title?: string | null;
}

export const conversationsQueries = createQueryKeys("conversations", {
  /** Fetch all turns for a conversation. */
  turns: (conversationId: string) => ({
    queryKey: ["conversations", conversationId, "turns"],
    queryFn: async (): Promise<TurnOut[]> => {
      const { data } = await apiClient.get<TurnOut[]>(
        `/conversations/${conversationId}/turns`,
      );
      return data;
    },
  }),
});

/** Create a new conversation. */
export async function createConversation(
  input: ConversationCreateInput = {},
): Promise<ConversationOut> {
  const { data } = await apiClient.post<ConversationOut>("/conversations", {
    title: input.title ?? null,
  });
  return data;
}

/** Fetch all turns for a conversation. */
export async function fetchConversationTurns(
  conversationId: string,
): Promise<TurnOut[]> {
  const { data } = await apiClient.get<TurnOut[]>(
    `/conversations/${conversationId}/turns`,
  );
  return data;
}

/**
 * SSE event types from the backend streaming endpoint.
 */
export type SSEEvent =
  | { event: "token"; data: { token: string } }
  | { event: "done"; data: { turn_id: string; text: string } }
  | { event: "error"; data: { message: string } };

export interface StreamTurnOptions {
  conversationId: string;
  text: string;
  onToken?: (token: string) => void;
  onDone?: (turnId: string, fullText: string) => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
}

/**
 * Stream assistant response using Server-Sent Events (SSE).
 * Returns a cleanup function to abort the connection.
 *
 * Note: Uses fetch API instead of EventSource because the backend
 * endpoint requires POST with request body.
 */
export function streamTurn({
  conversationId,
  text,
  onToken,
  onDone,
  onError,
  signal,
}: StreamTurnOptions): () => void {
  const baseURL = apiClient.defaults.baseURL ?? "";
  const url = `${baseURL}/conversations/${conversationId}/turns/stream`;

  const abortController = new AbortController();
  let isClosed = false;

  // Combine external signal with our own abort controller
  if (signal) {
    signal.addEventListener("abort", () => {
      abortController.abort();
    });
  }

  void (async () => {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ text }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Response body is not readable");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (!isClosed) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim() || line.startsWith(":")) continue;

          if (line.startsWith("event:")) {
            // Event type line - we'll handle it with the data
            continue;
          }

          if (line.startsWith("data:")) {
            const dataStr = line.slice(5).trim();
            try {
              const data = JSON.parse(dataStr);

              if (data.token !== undefined) {
                onToken?.(data.token as string);
              } else if (data.turn_id !== undefined && data.text !== undefined) {
                onDone?.(data.turn_id as string, data.text as string);
                cleanup();
              } else if (data.message !== undefined) {
                onError?.(data.message as string);
                cleanup();
              }
            } catch {
              // Ignore parse errors for individual events
            }
          }
        }
      }
    } catch (error) {
      if (!isClosed && error instanceof Error && error.name !== "AbortError") {
        onError?.(error.message);
      }
    } finally {
      cleanup();
    }
  })();

  function cleanup() {
    if (!isClosed) {
      isClosed = true;
      abortController.abort();
    }
  }

  return cleanup;
}
