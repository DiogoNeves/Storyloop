import { apiClient } from "./client";

export interface DictationTranscriptResponse {
  text: string;
}

export interface DictationTitleResponse {
  title: string;
}

export async function transcribeDictation(
  audio: Blob,
  filename = "dictation.webm",
): Promise<DictationTranscriptResponse> {
  const formData = new FormData();
  formData.append("file", audio, filename);

  const response = await apiClient.post<DictationTranscriptResponse>(
    "/dictation/transcribe",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );

  return response.data;
}

export async function generateDictationTitle(
  text: string,
): Promise<DictationTitleResponse> {
  const response = await apiClient.post<DictationTitleResponse>(
    "/dictation/title",
    { text },
  );

  return response.data;
}
