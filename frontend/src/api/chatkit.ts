import { apiClient } from "@/api/client";

export interface ChatkitSession {
  clientSecret: string;
  sessionId?: string | null;
}

export async function createChatkitSession(): Promise<ChatkitSession> {
  const response = await apiClient.post<ChatkitSession>("/chatkit/session");
  return response.data;
}

export const chatkitApi = {
  createChatkitSession,
};
