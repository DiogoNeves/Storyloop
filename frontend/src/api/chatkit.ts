import { apiClient } from "./client";

export interface ChatKitSessionResponse {
  client_secret: string;
  session_id?: string | null;
}

export async function createChatKitSession(): Promise<ChatKitSessionResponse> {
  const response = await apiClient.post<ChatKitSessionResponse>(
    "/chatkit/session"
  );
  return response.data;
}

