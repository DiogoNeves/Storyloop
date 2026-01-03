import { useCallback, useEffect, useRef, useState } from "react";

import { generateDictationTitle, transcribeDictation } from "@/api/dictation";
import { isAxiosError } from "@/api/client";

export type DictationStatus = "idle" | "recording" | "transcribing" | "error";

interface DictationOptions {
  onTranscript: (text: string) => void | Promise<void>;
  buildTitleInput?: (transcript: string) => string;
  onTitle?: (title: string) => void | Promise<void>;
}

interface DictationState {
  status: DictationStatus;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  retryTranscription: () => Promise<void>;
  hasRetry: boolean;
}

const DEFAULT_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
];

function resolveMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") {
    return undefined;
  }

  return DEFAULT_MIME_TYPES.find((mimeType) =>
    MediaRecorder.isTypeSupported(mimeType),
  );
}

function appendWithSpacing(current: string, addition: string): string {
  const trimmed = addition.trim();
  if (!trimmed) {
    return current;
  }
  const spacer = current.trim().length > 0 ? "\n\n" : "";
  return `${current}${spacer}${trimmed}`;
}

function resolveErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const message =
      error.response?.data?.detail ??
      error.message ??
      "We couldn't reach the dictation service.";
    return typeof message === "string" ? message : JSON.stringify(message);
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong with dictation.";
}

export function useDictation({
  onTranscript,
  buildTitleInput,
  onTitle,
}: DictationOptions): DictationState {
  const [status, setStatus] = useState<DictationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const retryBlobRef = useRef<Blob | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const runTitleGeneration = useCallback(
    async (transcript: string) => {
      if (!buildTitleInput || !onTitle) {
        return;
      }
      const titleInput = buildTitleInput(transcript);
      if (!titleInput.trim()) {
        return;
      }
      try {
        const { title } = await generateDictationTitle(titleInput);
        await onTitle(title);
      } catch (titleError) {
        setError(
          resolveErrorMessage(titleError) ||
            "We couldn't generate a title this time.",
        );
      }
    },
    [buildTitleInput, onTitle],
  );

  const sendTranscription = useCallback(
    async (blob: Blob) => {
      setStatus("transcribing");
      setError(null);

      try {
        const { text } = await transcribeDictation(blob);
        if (!text.trim()) {
          throw new Error("No dictation text returned.");
        }
        await onTranscript(text);
        retryBlobRef.current = null;
        setStatus("idle");
        await runTitleGeneration(text);
      } catch (transcriptionError) {
        retryBlobRef.current = blob;
        setStatus("error");
        setError(resolveErrorMessage(transcriptionError));
      }
    },
    [onTranscript, runTitleGeneration],
  );

  const startRecording = useCallback(async () => {
    if (status === "recording" || status === "transcribing") {
      return;
    }
    setError(null);
    retryBlobRef.current = null;

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setError("Audio recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = resolveMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const recordedMime = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: recordedMime });
        cleanupStream();
        recorderRef.current = null;
        chunksRef.current = [];
        if (blob.size === 0) {
          setStatus("error");
          setError("We didn't capture any audio. Please try again.");
          return;
        }
        void sendTranscription(blob);
      };

      recorderRef.current = recorder;
      streamRef.current = stream;
      recorder.start();
      setStatus("recording");
    } catch (captureError) {
      setStatus("error");
      setError(resolveErrorMessage(captureError));
      cleanupStream();
    }
  }, [cleanupStream, sendTranscription, status]);

  const stopRecording = useCallback(() => {
    if (status !== "recording") {
      return;
    }
    recorderRef.current?.stop();
  }, [status]);

  const retryTranscription = useCallback(async () => {
    if (!retryBlobRef.current) {
      return;
    }
    await sendTranscription(retryBlobRef.current);
  }, [sendTranscription]);

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      cleanupStream();
    };
  }, [cleanupStream]);

  return {
    status,
    error,
    startRecording,
    stopRecording,
    retryTranscription,
    hasRetry: Boolean(retryBlobRef.current),
  };
}

export function appendDictationText(current: string, addition: string): string {
  return appendWithSpacing(current, addition);
}
