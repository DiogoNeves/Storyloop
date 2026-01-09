import axios, { AxiosError } from "axios";

const DEFAULT_TIMEOUT = 10_000;

/**
 * Determine the backend API URL.
 *
 * Priority:
 * 1. VITE_API_BASE_URL environment variable (for production or custom deployments)
 * 2. Vite preview mode (port 4173) → direct connection to prod backend (port 8000)
 * 3. /api path (works with Vite dev proxy and reverse-proxy setups like Caddy/nginx)
 *
 * In development, Vite proxies /api/* requests to the backend.
 * In production, configure a reverse proxy to route /api/* to the backend,
 * or set VITE_API_BASE_URL to the full backend URL at build time.
 */
const resolveBaseUrl = (): string => {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (typeof configured === "string" && configured.length > 0) {
    return configured.replace(/\/$/, "");
  }

  // Vite preview mode (port 4173) has no proxy - connect directly to prod backend
  if (typeof window !== "undefined") {
    const { port, hostname } = window.location;
    if (
      port === "4173" &&
      (hostname === "localhost" || hostname === "127.0.0.1")
    ) {
      return "http://localhost:8000";
    }
  }

  // Dev mode uses Vite proxy; prod with reverse proxy uses same-origin
  return "/api";
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
