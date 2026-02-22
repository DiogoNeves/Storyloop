import { useCallback, useEffect, useRef, useState } from "react";

import { isAxiosError } from "@/api/client";
import { type DictationMode, transcribeAudio } from "@/api/speech";

export type AudioDictationStatus = "idle" | "recording" | "transcribing";

interface UseAudioDictationOptions {
  mode: DictationMode;
  onTranscription: (text: string, fallbackUsed: boolean) => void;
  audioInputDeviceId?: string | null;
}

interface UseAudioDictationResult {
  status: AudioDictationStatus;
  inputLevel: number;
  elapsedSeconds: number;
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
const INPUT_LEVEL_NOISE_FLOOR = 0.004;
const INPUT_LEVEL_DYNAMIC_RANGE = 0.06;
const INPUT_LEVEL_PREVIOUS_WEIGHT = 0.2;
const INPUT_LEVEL_UPDATE_INTERVAL_MS = 33;

export function useAudioDictation({
  mode,
  onTranscription,
  audioInputDeviceId,
}: UseAudioDictationOptions): UseAudioDictationResult {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const levelBufferRef = useRef(0);
  const lastLevelCommitRef = useRef(0);
  const lastLevelCommitAtRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);
  const lastElapsedSecondsRef = useRef(0);
  const isMountedRef = useRef(true);

  const [status, setStatus] = useState<AudioDictationStatus>("idle");
  const [inputLevel, setInputLevel] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isSupported =
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function";

  const stopInputLevelTracking = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    mediaSourceRef.current?.disconnect();
    mediaSourceRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;

    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context) {
      void context.close();
    }

    levelBufferRef.current = 0;
    lastLevelCommitRef.current = 0;
    lastLevelCommitAtRef.current = 0;
    setInputLevel(0);
  }, []);

  const startInputLevelTracking = useCallback(
    (stream: MediaStream) => {
      const audioContextConstructor =
        typeof window !== "undefined"
          ? (window.AudioContext ??
            // WebKit fallback for Safari.
            (window as Window & { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext)
          : undefined;

      if (!audioContextConstructor) {
        return;
      }

      const audioContext = new audioContextConstructor();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.85;

      const mediaSource = audioContext.createMediaStreamSource(stream);
      mediaSource.connect(analyser);

      const samples = new Uint8Array(analyser.fftSize);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      mediaSourceRef.current = mediaSource;

      const measureLevel = () => {
        const activeAnalyser = analyserRef.current;
        if (!activeAnalyser || !isMountedRef.current) {
          return;
        }

        activeAnalyser.getByteTimeDomainData(samples);
        let sumSquares = 0;
        for (const sample of samples) {
          const normalized = (sample - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / samples.length);
        const normalizedLevel = Math.min(
          Math.max(
            (rms - INPUT_LEVEL_NOISE_FLOOR) / INPUT_LEVEL_DYNAMIC_RANGE,
            0,
          ),
          1,
        );

        levelBufferRef.current =
          levelBufferRef.current * INPUT_LEVEL_PREVIOUS_WEIGHT +
          normalizedLevel * (1 - INPUT_LEVEL_PREVIOUS_WEIGHT);

        const now = performance.now();
        const hasElapsedInterval =
          now - lastLevelCommitAtRef.current >= INPUT_LEVEL_UPDATE_INTERVAL_MS;
        const levelDelta = Math.abs(
          levelBufferRef.current - lastLevelCommitRef.current,
        );
        if (hasElapsedInterval || levelDelta > 0.08) {
          lastLevelCommitAtRef.current = now;
          lastLevelCommitRef.current = levelBufferRef.current;
          setInputLevel(levelBufferRef.current);
        }

        if (startedAtRef.current !== null) {
          const elapsed = Math.floor((now - startedAtRef.current) / 1000);
          if (elapsed !== lastElapsedSecondsRef.current) {
            lastElapsedSecondsRef.current = elapsed;
            setElapsedSeconds(elapsed);
          }
        }

        animationFrameRef.current = requestAnimationFrame(measureLevel);
      };

      measureLevel();
    },
    [],
  );

  const releaseStream = useCallback(() => {
    stopInputLevelTracking();
    const stream = streamRef.current;
    if (!stream) {
      return;
    }

    stream.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, [stopInputLevelTracking]);

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
        setElapsedSeconds(0);
        startedAtRef.current = null;
        lastElapsedSecondsRef.current = 0;
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
        setElapsedSeconds(0);
        startedAtRef.current = null;
        lastElapsedSecondsRef.current = 0;
      } catch (error) {
        if (!isMountedRef.current) {
          return;
        }
        setErrorMessage(getDictationErrorMessage(error));
        setStatus("idle");
        setElapsedSeconds(0);
        startedAtRef.current = null;
        lastElapsedSecondsRef.current = 0;
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
      const stream = await requestAudioStream(audioInputDeviceId);
      streamRef.current = stream;
      startedAtRef.current = performance.now();
      lastElapsedSecondsRef.current = 0;
      setElapsedSeconds(0);
      startInputLevelTracking(stream);

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
        setElapsedSeconds(0);
        startedAtRef.current = null;
        lastElapsedSecondsRef.current = 0;
        mediaRecorderRef.current = null;
        chunksRef.current = [];
        releaseStream();
      };
      recorder.onstop = () => {
        void finalizeRecording(recorder.mimeType || preferredType || "audio/webm");
      };

      try {
        recorder.start(250);
      } catch {
        recorder.start();
      }
      setStatus("recording");
    } catch (error) {
      releaseStream();
      setStatus("idle");
      setElapsedSeconds(0);
      startedAtRef.current = null;
      lastElapsedSecondsRef.current = 0;
      setErrorMessage(getDictationErrorMessage(error));
    }
  }, [
    finalizeRecording,
    isSupported,
    releaseStream,
    startInputLevelTracking,
    status,
    audioInputDeviceId,
  ]);

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
      startedAtRef.current = null;
      lastElapsedSecondsRef.current = 0;
      setElapsedSeconds(0);
      stopInputLevelTracking();
      releaseStream();
    };
  }, [releaseStream, stopInputLevelTracking]);

  return {
    status,
    inputLevel,
    elapsedSeconds,
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
    if (error.code === "ECONNABORTED") {
      return "Transcription timed out. Please try again.";
    }
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

  if (
    error instanceof DOMException &&
    (error.name === "NotFoundError" || error.name === "OverconstrainedError")
  ) {
    return "Selected microphone is unavailable. Choose another microphone and try again.";
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Dictation failed. Please try again.";
}

function buildAudioConstraints(
  audioInputDeviceId: string | null | undefined,
): boolean | MediaTrackConstraints {
  const normalizedDeviceId = audioInputDeviceId?.trim();
  if (!normalizedDeviceId || normalizedDeviceId === "default") {
    return true;
  }

  return {
    deviceId: { exact: normalizedDeviceId },
  };
}

async function requestAudioStream(
  audioInputDeviceId: string | null | undefined,
): Promise<MediaStream> {
  const firstAttemptConstraints = buildAudioConstraints(audioInputDeviceId);
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: firstAttemptConstraints,
    });
  } catch (error) {
    if (!isRecoverableAudioDeviceError(error)) {
      throw error;
    }
    return navigator.mediaDevices.getUserMedia({ audio: true });
  }
}

function isRecoverableAudioDeviceError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "NotFoundError" ||
      error.name === "OverconstrainedError" ||
      error.name === "NotReadableError")
  );
}
