import axios, { AxiosError } from "axios";

const DEFAULT_TIMEOUT = 10_000;

/**
 * Determine the backend API URL.
 *
 * Localhost access (dev/preview testing):
 * - Port 4173 (vite preview) → http://localhost:8000 (prod backend)
 * - Port 5173 (vite dev) → /api (proxied to dev backend)
 *
 * Remote access (Tailscale/production):
 * - Uses VITE_API_BASE_URL if configured
 * - Falls back to /api for reverse proxy setups
 */
const resolveBaseUrl = (): string => {
  const configured = import.meta.env.VITE_API_BASE_URL;
  const isLocalhost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

  // For localhost, use local detection (ignore VITE_API_BASE_URL which is for remote access)
  if (isLocalhost) {
    const { port } = window.location;

    // Vite preview mode (port 4173) has no proxy - connect directly to prod backend
    if (port === "4173") {
      return "http://localhost:8000";
    }

    // Dev mode (port 5173) uses Vite proxy
    return "/api";
  }

  // Non-localhost: use VITE_API_BASE_URL if configured (for Tailscale/remote access)
  if (typeof configured === "string" && configured.length > 0) {
    return configured.replace(/\/$/, "");
  }

  // Fallback: same-origin /api (for reverse proxy setups)
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
