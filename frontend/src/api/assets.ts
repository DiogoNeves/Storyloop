import { apiClient } from "@/api/client";

export interface AssetUploadResponse {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  markdown: string;
  alreadyExists: boolean;
}

export interface AssetMetaResponse {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}

export async function uploadAsset(file: File): Promise<AssetUploadResponse> {
  // Only compute hash for non-image files (PDFs). Images are re-encoded server-side,
  // so the client cannot predict the final stored hash.
  const isImage = file.type.startsWith("image/");
  const hash = isImage ? null : await computeSha256Hex(file);
  const formData = new FormData();
  formData.append("file", file);

  const endpoint = hash ? `/assets/${hash}` : "/assets";
  // Let axios auto-detect Content-Type for FormData (overrides client default)
  const { data } = await apiClient.post<AssetUploadResponse>(endpoint, formData, {
    headers: { "Content-Type": undefined },
  });
  return data;
}

export async function getAssetMeta(
  assetId: string,
): Promise<AssetMetaResponse> {
  const { data } = await apiClient.get<AssetMetaResponse>(
    `/assets/${assetId}/meta`,
  );
  return data;
}

async function computeSha256Hex(file: File): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    return null;
  }

  try {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}
