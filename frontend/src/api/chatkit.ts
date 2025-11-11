import axios from "axios";

import { apiClient } from "@/api/client";

export interface ChatKitSession {
  clientSecret: string;
  sessionId: string;
  expiresAt: string;
}

function extractMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string" && detail.length > 0) {
      return detail;
    }
    if (typeof error.message === "string" && error.message.length > 0) {
      return error.message;
    }
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return "Unable to start a ChatKit session.";
}

export async function requestChatKitSession(): Promise<ChatKitSession> {
  try {
    const response = await apiClient.post<ChatKitSession>("/chatkit/session");
    return response.data;
  } catch (error) {
    throw new Error(extractMessage(error));
  }
}
