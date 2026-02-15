import { useCallback, useEffect, useRef, useState } from "react";

import { isAxiosError } from "@/api/client";
import { type DictationMode, transcribeAudio } from "@/api/speech";

export type AudioDictationStatus = "idle" | "recording" | "transcribing";

interface UseAudioDictationOptions {
  mode: DictationMode;
  onTranscription: (text: string, fallbackUsed: boolean) => void;
}

interface UseAudioDictationResult {
  status: AudioDictationStatus;
  isSupported: boolean;
  errorMessage: string | null;
  startDictation: () => Promise<void>;
  stopDictation: () => void;
  toggleDictation: () => Promise<void>;
  clearError: () => void;
}

const RECORDER_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
] as const;

export function useAudioDictation({
  mode,
  onTranscription,
}: UseAudioDictationOptions): UseAudioDictationResult {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const isMountedRef = useRef(true);

  const [status, setStatus] = useState<AudioDictationStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isSupported =
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function";

  const releaseStream = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) {
      return;
    }

    stream.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  const finalizeRecording = useCallback(
    async (recorderMimeType: string) => {
      const blobType = recorderMimeType || "audio/webm";
      const audioBlob = new Blob(chunksRef.current, { type: blobType });
      chunksRef.current = [];
      mediaRecorderRef.current = null;
      releaseStream();

      if (audioBlob.size === 0) {
        if (!isMountedRef.current) {
          return;
        }
        setErrorMessage("No audio was captured. Please try again.");
        setStatus("idle");
        return;
      }

      const extension = getFileExtension(blobType);
      const audioFile = new File([audioBlob], `dictation.${extension}`, {
        type: blobType,
      });

      try {
        const result = await transcribeAudio(audioFile, mode);
        if (!isMountedRef.current) {
          return;
        }

        const normalizedText = result.text.trim();
        if (!normalizedText) {
          setErrorMessage("We couldn't detect speech in that recording.");
          setStatus("idle");
          return;
        }

        onTranscription(normalizedText, result.fallbackUsed);
        setStatus("idle");
      } catch (error) {
        if (!isMountedRef.current) {
          return;
        }
        setErrorMessage(getDictationErrorMessage(error));
        setStatus("idle");
      }
    },
    [mode, onTranscription, releaseStream],
  );

  const startDictation = useCallback(async () => {
    if (!isSupported) {
      setErrorMessage("Dictation is not supported in this browser.");
      return;
    }
    if (status !== "idle") {
      return;
    }

    setErrorMessage(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const preferredType = getSupportedRecorderType();
      const recorder = preferredType
        ? new MediaRecorder(stream, { mimeType: preferredType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        if (!isMountedRef.current) {
          return;
        }
        setErrorMessage("Recording failed. Please try again.");
        setStatus("idle");
        mediaRecorderRef.current = null;
        chunksRef.current = [];
        releaseStream();
      };
      recorder.onstop = () => {
        void finalizeRecording(recorder.mimeType || preferredType || "audio/webm");
      };

      recorder.start();
      setStatus("recording");
    } catch (error) {
      releaseStream();
      setStatus("idle");
      setErrorMessage(getDictationErrorMessage(error));
    }
  }, [finalizeRecording, isSupported, releaseStream, status]);

  const stopDictation = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state !== "recording") {
      return;
    }

    setStatus("transcribing");
    recorder.stop();
  }, []);

  const toggleDictation = useCallback(async () => {
    if (status === "recording") {
      stopDictation();
      return;
    }

    await startDictation();
  }, [startDictation, status, stopDictation]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      const recorder = mediaRecorderRef.current;
      if (recorder?.state === "recording") {
        recorder.stop();
      }
      releaseStream();
    };
  }, [releaseStream]);

  return {
    status,
    isSupported,
    errorMessage,
    startDictation,
    stopDictation,
    toggleDictation,
    clearError,
  };
}

function getSupportedRecorderType(): string {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return "";
  }

  return (
    RECORDER_MIME_TYPES.find((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType),
    ) ?? ""
  );
}

function getFileExtension(contentType: string): string {
  const normalized = contentType.toLowerCase();
  if (normalized.includes("webm")) {
    return "webm";
  }
  if (normalized.includes("ogg")) {
    return "ogg";
  }
  if (normalized.includes("wav")) {
    return "wav";
  }
  if (normalized.includes("mpeg") || normalized.includes("mp3")) {
    return "mp3";
  }
  if (normalized.includes("m4a")) {
    return "m4a";
  }
  if (normalized.includes("mp4")) {
    return "mp4";
  }
  return "webm";
}

function getDictationErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const payload = error.response?.data;
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? (payload as { detail?: unknown }).detail
        : null;
    if (typeof detail === "string" && detail.trim().length > 0) {
      return detail;
    }
    return "We couldn't transcribe your recording. Please try again.";
  }

  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Microphone access was denied. Allow microphone permissions and try again.";
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Dictation failed. Please try again.";
}
