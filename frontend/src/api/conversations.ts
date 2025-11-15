import axios, { AxiosError } from "axios";

import { API_BASE_URL, apiClient } from "@/api/client";
import type { AgentMessageRole } from "@/lib/types/agent";

interface ConversationRecord {
  id: string;
  title: string | null;
  created_at: string;
}

interface TurnRecord {
  id: string;
  role: AgentMessageRole;
  text: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string | null;
  createdAt: string;
}

export interface ConversationTurn {
  id: string;
  role: AgentMessageRole;
  text: string;
  createdAt: string;
}

export function isNotFoundError(error: unknown): boolean {
  if (!isAxiosError(error)) {
    return false;
  }
  return error.response?.status === 404;
}

function isAxiosError(error: unknown): error is AxiosError {
  return axios.isAxiosError(error);
}

export async function createConversation(
  title?: string | null,
): Promise<Conversation> {
  const payload = title ? { title } : undefined;
  const { data } = await apiClient.post<ConversationRecord>("/conversations", payload);
  return {
    id: data.id,
    title: data.title,
    createdAt: data.created_at,
  };
}

export async function listConversationTurns(
  conversationId: string,
): Promise<ConversationTurn[]> {
  const { data } = await apiClient.get<TurnRecord[]>(
    `/conversations/${conversationId}/turns`,
  );
  return data.map((turn) => ({
    id: turn.id,
    role: turn.role,
    text: turn.text,
    createdAt: turn.created_at,
  }));
}

export interface ConversationStreamCallbacks {
  onOpen?: () => void;
  onToken?: (token: string) => void;
  onDone?: (payload: { turnId?: string; text?: string }) => void;
  onError?: (message: string) => void;
}

export interface StreamTurnOptions {
  conversationId: string;
  text: string;
  signal?: AbortSignal;
  callbacks?: ConversationStreamCallbacks;
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

function handleParsedEvent(
  parsed: ParsedSseEvent,
  callbacks: ConversationStreamCallbacks | undefined,
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
      const turnId =
        typeof record.turn_id === "string" ? record.turn_id : undefined;
      const text = typeof record.text === "string" ? record.text : undefined;
      onDone?.({ turnId, text });
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
          : "Loopie encountered a problem generating a response.";
      onError?.(resolvedMessage);
      return true;
    }
    default:
      return false;
  }
}

export async function streamConversationTurn(
  options: StreamTurnOptions,
): Promise<void> {
  const { conversationId, text, signal, callbacks } = options;
  const response = await fetch(
    `${API_BASE_URL}/conversations/${conversationId}/turns/stream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify({ text }),
      signal,
      mode: "cors",
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    const error = new Error(
      errorText || `Failed to stream assistant response (status ${response.status}).`,
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

  try {
    while (!shouldStop) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseSseEvent(rawEvent);
        if (parsed) {
          shouldStop = handleParsedEvent(parsed, callbacks) || shouldStop;
        }
        boundary = buffer.indexOf("\n\n");
      }
    }

    if (!shouldStop && buffer.trim().length > 0) {
      const parsed = parseSseEvent(buffer);
      if (parsed) {
        shouldStop = handleParsedEvent(parsed, callbacks) || shouldStop;
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
