import { apiBaseUrl, apiClient } from "@/api/client";

const CHAT_PATH = "/agent/chat";
const STREAM_PATH = "/agent/chat/stream";

export type AgentRole = "system" | "user" | "assistant" | "tool";

export interface AgentMessage {
  id?: string;
  role: AgentRole;
  content: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentChatContext {
  routePath?: string;
  [key: string]: unknown;
}

export interface AgentChatRequest {
  sessionId: string;
  messages: AgentMessage[];
  context?: AgentChatContext;
  attachments?: unknown[];
  metadata?: Record<string, unknown>;
}

export interface AgentChatResponse {
  sessionId: string;
  message: AgentMessage;
  messages?: AgentMessage[];
  usage?: Record<string, unknown>;
  raw?: unknown;
}

export interface AgentStreamEvent<T = unknown> {
  type: string;
  data: T;
  id?: string;
  retry?: number;
  rawEvent: string;
}

export interface StreamAgentChatOptions {
  payload: AgentChatRequest;
  onEvent: (event: AgentStreamEvent) => void;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface AgentStreamHandle {
  abort(reason?: unknown): void;
  closed: Promise<void>;
}

/**
 * Submit a chat request to the agent without streaming. The backend will respond
 * with the fully materialised assistant message once it has been generated.
 */
export async function agentChat(
  payload: AgentChatRequest,
  options?: { signal?: AbortSignal },
): Promise<AgentChatResponse> {
  const { data } = await apiClient.post<AgentChatResponse>(CHAT_PATH, payload, {
    signal: options?.signal,
  });
  return data;
}

/**
 * Initiate a streaming chat request to the agent. Incoming events follow the
 * Claude streaming schema (e.g. `message_start`, `content_block_delta`, etc.).
 * The caller receives every parsed event via `onEvent` and can await
 * `handle.closed` to know when the stream has finished.
 */
export function streamAgentChat({
  payload,
  onEvent,
  signal,
  headers,
}: StreamAgentChatOptions): AgentStreamHandle {
  const controller = new AbortController();

  const abortFromExternalSignal = () => controller.abort(signal?.reason);

  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      signal.addEventListener("abort", abortFromExternalSignal, { once: true });
    }
  }

  const closedPromise = (async () => {
    try {
      const response = await fetch(`${apiBaseUrl}${STREAM_PATH}`, {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw await buildStreamError(response);
      }

      if (!response.body) {
        throw new Error("Agent stream response did not include a body.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder
            .decode(value, { stream: true })
            .replace(/\r\n/g, "\n");

          buffer = emitParsedEvents(buffer, onEvent);
        }

        buffer += decoder.decode();
        emitParsedEvents(buffer, onEvent, true);
      } finally {
        reader.releaseLock();
      }
    } finally {
      if (signal && !signal.aborted) {
        signal.removeEventListener("abort", abortFromExternalSignal);
      }
    }
  })();

  const closed = closedPromise.catch((error) => {
    if (isAbortError(error)) {
      return;
    }
    throw error;
  });

  return {
    abort(reason?: unknown) {
      controller.abort(reason);
    },
    closed,
  };
}

function emitParsedEvents(
  buffer: string,
  onEvent: (event: AgentStreamEvent) => void,
  flush = false,
): string {
  let working = buffer;
  let separatorIndex = working.indexOf("\n\n");

  while (separatorIndex !== -1) {
    const rawEvent = working.slice(0, separatorIndex);
    working = working.slice(separatorIndex + 2);

    const trimmed = rawEvent.trim();
    if (trimmed.length > 0) {
      const parsed = parseSseEvent(trimmed);
      if (parsed) {
        onEvent(parsed);
      }
    }

    separatorIndex = working.indexOf("\n\n");
  }

  if (flush) {
    const trimmed = working.trim();
    if (trimmed.length > 0) {
      const parsed = parseSseEvent(trimmed);
      if (parsed) {
        onEvent(parsed);
      }
      working = "";
    }
  }

  return working;
}

function parseSseEvent(rawEvent: string): AgentStreamEvent | null {
  const lines = rawEvent.split("\n");
  let eventType = "message";
  const dataLines: string[] = [];
  let id: string | undefined;
  let retry: number | undefined;

  for (const line of lines) {
    if (line.startsWith(":")) {
      continue;
    }

    const colonIndex = line.indexOf(":");
    const field =
      colonIndex === -1 ? line : line.slice(0, Math.max(0, colonIndex));
    let value = colonIndex === -1 ? "" : line.slice(colonIndex + 1);

    if (value.startsWith(" ")) {
      value = value.slice(1);
    }

    switch (field) {
      case "event": {
        eventType = value.length > 0 ? value : "message";
        break;
      }
      case "data": {
        dataLines.push(value);
        break;
      }
      case "id": {
        id = value.length > 0 ? value : undefined;
        break;
      }
      case "retry": {
        const parsedRetry = Number.parseInt(value, 10);
        retry = Number.isNaN(parsedRetry) ? undefined : parsedRetry;
        break;
      }
      default: {
        break;
      }
    }
  }

  const dataPayload = dataLines.join("\n");
  let parsedData: unknown = null;

  if (dataPayload.length > 0) {
    try {
      parsedData = JSON.parse(dataPayload);
    } catch {
      parsedData = dataPayload;
    }
  }

  return {
    type: eventType,
    data: parsedData,
    id,
    retry,
    rawEvent,
  };
}

async function buildStreamError(response: Response): Promise<Error> {
  const contentType = response.headers.get("Content-Type") ?? "";
  let message = `Agent stream request failed with status ${response.status}`;

  try {
    if (contentType.includes("application/json")) {
      const body = await response.json();
      if (typeof body === "object" && body !== null) {
        const detail =
          typeof (body as { detail?: unknown }).detail === "string"
            ? (body as { detail?: string }).detail
            : undefined;
        message = detail ?? JSON.stringify(body);
      }
    } else {
      const text = (await response.text()).trim();
      if (text.length > 0) {
        message = text;
      }
    }
  } catch {
    // Ignore parsing errors and fall back to the default message.
  }

  const error = new Error(message);
  (error as Error & { status?: number }).status = response.status;
  return error;
}

function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}
