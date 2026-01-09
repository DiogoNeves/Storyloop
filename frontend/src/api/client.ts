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
 *
 * IMPORTANT: Tailscale Setup Required
 * - Port 442 must proxy to localhost:8001 (dev backend)
 * - Port 444 must proxy to localhost:8000 (prod backend)
 * - Frontend needs its own Tailscale proxy:
 *   - Dev: Default Tailscale port → localhost:5173
 *   - Prod: Port 445 (or another) → localhost:4173
 * - Access frontend via its Tailscale port, API calls will route to backend ports
 */
const resolveBaseUrl = (): string => {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL;
  const mode = import.meta.env.MODE;
  const isProd = mode === "prod" || mode === "production";

  if (typeof window === "undefined") {
    return "http://localhost:8001";
  }

  const { protocol, hostname, port, href } = window.location;
  // Extract port from full URL if port is empty (common with HTTPS)
  // For Tailscale, check for specific ports :442 or :444 in the URL
  let fullPort = port;
  if (!fullPort && hostname.endsWith(".ts.net")) {
    if (href.includes(":442")) fullPort = "442";
    else if (href.includes(":444")) fullPort = "444";
    else fullPort = ""; // Will use default based on mode
  }

  // Tailscale access: route API calls to backend ports
  // Port 442 = dev backend, Port 444 = prod backend
  // Port 445 (or default) = frontend preview, routes API to 444
  // Default Tailscale port = frontend dev, routes API to 442
  if (hostname.endsWith(".ts.net")) {
    let backendPort: string;

    // Determine backend port based on frontend access port
    if (fullPort === "445" || (isProd && !fullPort)) {
      // Frontend preview port (445) or prod mode default → backend port 444
      backendPort = "444";
    } else if (fullPort === "444" || fullPort === "442") {
      // Direct backend access → use same port
      backendPort = fullPort;
    } else {
      // Default/dev frontend → backend port 442
      backendPort = "442";
    }

    return `${protocol}//${hostname}:${backendPort}`;
  }

  // Localhost access: pick backend port by mode/frontend port
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    const backendPort = isProd || fullPort === "4173" ? "8000" : "8001";
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
