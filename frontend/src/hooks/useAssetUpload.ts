import { useCallback, useState } from "react";

import { uploadAsset, type AssetUploadResponse } from "@/api/assets";

interface UseAssetUploadOptions {
  onUploaded?: (asset: AssetUploadResponse) => void;
  onError?: (error: Error) => void;
}

export function useAssetUpload({ onUploaded, onError }: UseAssetUploadOptions) {
  const [isUploading, setIsUploading] = useState(false);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) {
        return;
      }
      setIsUploading(true);
      try {
        for (const file of fileArray) {
          const asset = await uploadAsset(file);
          onUploaded?.(asset);
        }
      } catch (error) {
        onError?.(
          error instanceof Error
            ? error
            : new Error("Upload failed. Please try again."),
        );
      } finally {
        setIsUploading(false);
      }
    },
    [onError, onUploaded],
  );

  return { uploadFiles, isUploading };
}
