import { apiClient } from "@/api/client";

export type DictationMode = "loopie" | "journal_note";
const TRANSCRIPTION_REQUEST_TIMEOUT_MS = 70_000;

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
      timeout: TRANSCRIPTION_REQUEST_TIMEOUT_MS,
    },
  );

  return data;
}
