import { apiClient } from "@/api/client";

export type DictationMode = "loopie" | "journal_note";

export interface SpeechTranscriptionResponse {
  text: string;
  fallbackUsed: boolean;
}

export async function transcribeAudio(
  file: File,
  mode: DictationMode = "loopie",
): Promise<SpeechTranscriptionResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("mode", mode);

  const { data } = await apiClient.post<SpeechTranscriptionResponse>(
    "/speech/transcriptions",
    formData,
    {
      headers: { "Content-Type": undefined },
    },
  );

  return data;
}
