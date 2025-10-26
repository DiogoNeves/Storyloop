import axios from "axios";

const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_BASE_URL = "http://localhost:8000";

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL;

const baseURL =
  typeof configuredBaseUrl === "string" && configuredBaseUrl.length > 0
    ? configuredBaseUrl.replace(/\/$/, "")
    : DEFAULT_BASE_URL;

export const apiClient = axios.create({
  baseURL,
  timeout: DEFAULT_TIMEOUT,
  headers: {
    "Content-Type": "application/json",
  },
});

export interface HealthResponse {
  status: string;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await apiClient.get<HealthResponse>("/health");
  return response.data;
}
