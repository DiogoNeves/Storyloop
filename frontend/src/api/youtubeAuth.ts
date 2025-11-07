import { apiClient } from "@/api/client";

export interface YoutubeAuthStatusResponse {
  linked: boolean;
  channel_id: string | null;
  channel_title: string | null;
  channel_thumbnail_url: string | null;
}

export interface YoutubeAuthStartResponse {
  authorization_url: string;
  state: string;
}

export async function startYoutubeAuth(frontendUrl: string) {
  const response = await apiClient.get<YoutubeAuthStartResponse>(
    "/youtube/auth/start",
    {
      params: { frontend_url: frontendUrl },
    },
  );
  return response.data;
}

export async function getYoutubeAuthStatus() {
  const response = await apiClient.get<YoutubeAuthStatusResponse>(
    "/youtube/auth/status",
  );
  return response.data;
}

export async function refreshYoutubeToken() {
  const response = await apiClient.post<{ success: boolean; message: string }>(
    "/youtube/auth/refresh",
  );
  return response.data;
}

export const youtubeAuthApi = {
  startYoutubeAuth,
  getYoutubeAuthStatus,
  refreshYoutubeToken,
};
