import axios, { AxiosError } from "axios";

const DEFAULT_TIMEOUT = 10_000;
const defaultProtocol =
  typeof window === "undefined" ? "http:" : window.location.protocol;
const defaultBackendHost =
  typeof window === "undefined" ? "localhost" : window.location.hostname;
const DEFAULT_BASE_URL = `${defaultProtocol}//${defaultBackendHost}:8001`;

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
