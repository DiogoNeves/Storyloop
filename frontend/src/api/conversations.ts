import { apiClient } from "@/api/client";

export interface ConversationCreate {
  title?: string | null;
}

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

export interface SSEEvent {
  event: "token" | "done" | "error";
  data: {
    token?: string;
    turn_id?: string;
    text?: string;
    message?: string;
  };
}

/**
 * Create a new conversation.
 */
export async function createConversation(
  input?: ConversationCreate,
): Promise<ConversationOut> {
  const { data } = await apiClient.post<ConversationOut>(
    "/conversations",
    input ?? {},
  );
  return data;
}

/**
 * List all turns for a conversation.
 */
export async function listTurns(conversationId: string): Promise<TurnOut[]> {
  const { data } = await apiClient.get<TurnOut[]>(
    `/conversations/${conversationId}/turns`,
  );
  return data;
}

/**
 * Stream assistant response for a user message using Server-Sent Events.
 * Returns an async generator that yields SSE events.
 */
export async function* streamTurn(
  conversationId: string,
  input: TurnInput,
): AsyncGenerator<SSEEvent, void, unknown> {
  const baseURL = apiClient.defaults.baseURL ?? "http://localhost:8000";
  const url = `${baseURL}/conversations/${conversationId}/turns/stream`;

  console.log("[streamTurn] Starting SSE stream:", { url, input });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorText = await response.text();
    yield {
      event: "error",
      data: {
        message: `Request failed: ${response.status} ${errorText}`,
      },
    };
    return;
  }

  if (!response.body) {
    yield {
      event: "error",
      data: {
        message: "Response body is null",
      },
    };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent: string | null = null;
  let currentData: string | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // Process any remaining data in buffer
        if (currentData !== null && currentEvent !== null) {
          try {
            const dataPayload = JSON.parse(currentData);
            const event: SSEEvent = {
              event: currentEvent as "token" | "done" | "error",
              data: dataPayload,
            };
            console.log("[streamTurn] Parsed SSE event:", event);
            yield event;
            if (event.event === "done" || event.event === "error") {
              return;
            }
          } catch (error) {
            // Skip malformed JSON
          }
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === "") {
          // Empty line indicates end of event, yield if we have complete event
          if (currentData !== null && currentEvent !== null) {
            try {
              const dataPayload = JSON.parse(currentData);
              const event: SSEEvent = {
                event: currentEvent as "token" | "done" | "error",
                data: dataPayload,
              };
              yield event;
              if (event.event === "done" || event.event === "error") {
                return;
              }
            } catch (error) {
              // Skip malformed JSON
            }
          }
          // Reset for next event
          currentEvent = null;
          currentData = null;
          continue;
        }

        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          currentData = line.slice(6);
        }
        // Ignore other fields like "id:" for now
      }
    }
  } finally {
    reader.releaseLock();
  }
}
