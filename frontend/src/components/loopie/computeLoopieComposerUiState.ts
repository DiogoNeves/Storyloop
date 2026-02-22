import type { AudioDictationStatus } from "@/hooks/useAudioDictation";
import type { AgentComposerState } from "@/lib/types/agent";

interface ComputeLoopieComposerUiStateArgs {
  disabled: boolean;
  composer: AgentComposerState;
  dictationStatus: AudioDictationStatus;
  isDictationSupported: boolean;
  isUploading: boolean;
  inputValue: string;
  attachmentsCount: number;
  surfaceVariant: "panel" | "page";
  idleHelperText?: string;
  respondingHelperText?: string;
}

export interface LoopieComposerUiState {
  isTextareaDisabled: boolean;
  isDictating: boolean;
  isTranscribingDictation: boolean;
  isDictationDisabled: boolean;
  isSendDisabled: boolean;
  showStopButton: boolean;
  composerLabel: string;
  helperText: string;
  padding: string;
  composerSurface: string;
}

export function computeLoopieComposerUiState({
  disabled,
  composer,
  dictationStatus,
  isDictationSupported,
  isUploading,
  inputValue,
  attachmentsCount,
  surfaceVariant,
  idleHelperText,
  respondingHelperText,
}: ComputeLoopieComposerUiStateArgs): LoopieComposerUiState {
  const isTextareaDisabled =
    disabled || composer.status === "responding" || dictationStatus === "transcribing";
  const isDictating = dictationStatus === "recording";
  const isTranscribingDictation = dictationStatus === "transcribing";
  const isDictationDisabled =
    (!isDictating && !isDictationSupported) ||
    disabled ||
    isUploading ||
    composer.status !== "idle" ||
    isTranscribingDictation;
  const isSendDisabled =
    disabled ||
    composer.status !== "idle" ||
    dictationStatus !== "idle" ||
    (inputValue.trim() === "" && attachmentsCount === 0);
  const showStopButton =
    composer.status === "sending" || composer.status === "responding";

  const composerLabel =
    composer.status === "responding"
      ? "Loopie is thinking"
      : composer.status === "sending"
        ? "Sending to Loopie"
        : "Share your next move with Loopie";

  const padding = surfaceVariant === "panel" ? "px-6 py-5" : "p-2 sm:p-4";
  const composerSurface =
    surfaceVariant === "panel"
      ? "bg-background/98 border-t border-border/40"
      : "bg-background/90 border-t border-border/50";
  const helperText =
    composer.status === "responding"
      ? (respondingHelperText ?? "Loopie is synthesizing a tailored suggestion")
      : (idleHelperText ?? composerLabel);

  return {
    isTextareaDisabled,
    isDictating,
    isTranscribingDictation,
    isDictationDisabled,
    isSendDisabled,
    showStopButton,
    composerLabel,
    helperText,
    padding,
    composerSurface,
  };
}
