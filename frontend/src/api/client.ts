import axios, { AxiosError } from "axios";

const DEFAULT_TIMEOUT = 10_000;

/**
 * Determine the backend API URL based on environment and access context.
 *
 * Priority:
 * 1. If accessing via Tailscale (ts.net hostname), use Tailscale backend URL
 *    with port based on mode: 442 for dev, 444 for prod
 * 2. If accessing via localhost, use localhost backend:
 *    8001 for dev (port 5173), 8000 for prod (port 4173 or MODE=prod)
 * 3. VITE_API_BASE_URL is only used as a fallback for other hostnames
 */
const resolveBaseUrl = (): string => {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL;
  const mode = import.meta.env.MODE;
  const isProd = mode === "prod" || mode === "production";

  if (typeof window === "undefined") {
    return "http://localhost:8001";
  }

  const { protocol, hostname, port } = window.location;

  // Tailscale access: use same protocol/hostname, pick backend port by mode
  if (hostname.endsWith(".ts.net")) {
    const backendPort = isProd ? "444" : "442";
    return `${protocol}//${hostname}:${backendPort}`;
  }

  // Localhost access: pick backend port by mode/frontend port
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    const backendPort = isProd || port === "4173" ? "8000" : "8001";
    return `${protocol}//${hostname}:${backendPort}`;
  }

  // Other hostnames: use configured URL or fallback to prod backend
  if (typeof configuredBaseUrl === "string" && configuredBaseUrl.length > 0) {
    return configuredBaseUrl.replace(/\/$/, "");
  }

  return `${protocol}//${hostname}:8000`;
};

const baseURL = resolveBaseUrl();

export const apiClient = axios.create({
  baseURL,
  timeout: DEFAULT_TIMEOUT,
  headers: {
    "Content-Type": "application/json",
  },
});

export const API_BASE_URL = baseURL;

export function isAxiosError(error: unknown): error is AxiosError {
  return axios.isAxiosError(error);
}

export function isNotFoundError(error: unknown): boolean {
  if (!isAxiosError(error)) {
    return false;
  }
  return error.response?.status === 404;
}
