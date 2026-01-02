import { API_BASE_URL } from "@/api/client";

export const ASSET_PATH_PREFIX = "/assets/";

export interface AssetAttachment {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  width?: number | null;
  height?: number | null;
}

export function isAssetPath(value?: string | null): value is string {
  return typeof value === "string" && value.startsWith(ASSET_PATH_PREFIX);
}

export function resolveAssetUrl(value: string): string {
  if (!isAssetPath(value)) {
    return value;
  }
  return `${API_BASE_URL}${value}`;
}

export function getAssetId(value: string): string | null {
  if (!isAssetPath(value)) {
    return null;
  }
  const id = value.slice(ASSET_PATH_PREFIX.length);
  return id.length > 0 ? id : null;
}

export function isImageAsset(mimeType?: string | null): boolean {
  return typeof mimeType === "string" && mimeType.startsWith("image/");
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
