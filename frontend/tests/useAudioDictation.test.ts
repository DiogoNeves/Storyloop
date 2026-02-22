import { act, renderHook, waitFor } from "@testing-library/react";
import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { transcribeAudio } from "@/api/speech";
import { useAudioDictation } from "@/hooks/useAudioDictation";

vi.mock("@/api/speech", () => ({
  transcribeAudio: vi.fn(),
}));

const transcribeAudioMock = vi.mocked(transcribeAudio);

class MockMediaRecorder {
  static isTypeSupported = vi.fn((mimeType: string) => mimeType.includes("webm"));

  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;
  readonly mimeType: string;
  state: RecordingState = "inactive";

  constructor(
    _stream: MediaStream,
    options?: MediaRecorderOptions,
  ) {
    this.mimeType = options?.mimeType ?? "audio/webm";
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.(
      {
        data: new Blob(["audio-bytes"], { type: this.mimeType }),
      } as BlobEvent,
    );
    this.onstop?.(new Event("stop"));
  }
}

describe("useAudioDictation", () => {
  const stopTrack = vi.fn();
  const getUserMediaMock = vi.fn();

  beforeEach(() => {
    stopTrack.mockReset();
    getUserMediaMock.mockReset();
    transcribeAudioMock.mockReset();

    const stream = {
      getTracks: () => [{ stop: stopTrack }],
    } as unknown as MediaStream;

    getUserMediaMock.mockResolvedValue(stream);

    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      writable: true,
      value: MockMediaRecorder,
    });

    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: getUserMediaMock,
      },
    });
  });

  it("records audio, transcribes it, and returns to idle", async () => {
    const onTranscription = vi.fn();
    transcribeAudioMock.mockResolvedValue({
      text: "Dictated line",
      fallbackUsed: false,
    });

    const { result } = renderHook(() =>
      useAudioDictation({ mode: "loopie", onTranscription }),
    );

    await act(async () => {
      await result.current.startDictation();
    });

    expect(result.current.status).toBe("recording");

    act(() => {
      result.current.stopDictation();
    });

    expect(result.current.status).toBe("transcribing");

    await waitFor(() => {
      expect(onTranscription).toHaveBeenCalledWith("Dictated line", false);
    });
    expect(result.current.status).toBe("idle");
    expect(transcribeAudioMock).toHaveBeenCalledWith(
      expect.any(File),
      "loopie",
    );
    expect(stopTrack).toHaveBeenCalled();
  });

  it("surfaces permission errors when microphone access is denied", async () => {
    const onTranscription = vi.fn();
    getUserMediaMock.mockRejectedValue(
      new DOMException("Permission denied", "NotAllowedError"),
    );

    const { result } = renderHook(() =>
      useAudioDictation({ mode: "loopie", onTranscription }),
    );

    await act(async () => {
      await result.current.startDictation();
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.errorMessage).toBe(
      "Microphone access was denied. Allow microphone permissions and try again.",
    );
    expect(onTranscription).not.toHaveBeenCalled();
  });

  it("uses the selected audio input device when provided", async () => {
    const onTranscription = vi.fn();
    transcribeAudioMock.mockResolvedValue({
      text: "Dictated line",
      fallbackUsed: false,
    });

    const { result } = renderHook(() =>
      useAudioDictation({
        mode: "loopie",
        onTranscription,
        audioInputDeviceId: "mic-device-1",
      }),
    );

    await act(async () => {
      await result.current.startDictation();
    });

    expect(getUserMediaMock).toHaveBeenCalledWith({
      audio: {
        deviceId: { exact: "mic-device-1" },
      },
    });
  });

  it("falls back to default input constraints when selected microphone is unavailable", async () => {
    const onTranscription = vi.fn();
    getUserMediaMock
      .mockRejectedValueOnce(
        new DOMException("Requested device not found", "NotFoundError"),
      )
      .mockResolvedValueOnce({
        getTracks: () => [{ stop: stopTrack }],
      } as unknown as MediaStream);

    const { result } = renderHook(() =>
      useAudioDictation({
        mode: "loopie",
        onTranscription,
        audioInputDeviceId: "missing-device",
      }),
    );

    await act(async () => {
      await result.current.startDictation();
    });

    expect(getUserMediaMock).toHaveBeenNthCalledWith(1, {
      audio: {
        deviceId: { exact: "missing-device" },
      },
    });
    expect(getUserMediaMock).toHaveBeenNthCalledWith(2, {
      audio: true,
    });
    expect(result.current.status).toBe("recording");
  });

  it("surfaces transcription failures", async () => {
    const onTranscription = vi.fn();
    transcribeAudioMock.mockRejectedValue(new Error("transcription failed"));

    const { result } = renderHook(() =>
      useAudioDictation({ mode: "journal_note", onTranscription }),
    );

    await act(async () => {
      await result.current.startDictation();
    });

    act(() => {
      result.current.stopDictation();
    });

    await waitFor(() => {
      expect(result.current.errorMessage).toBe("transcription failed");
    });
    expect(result.current.status).toBe("idle");
    expect(onTranscription).not.toHaveBeenCalled();
  });

  it("surfaces transcription timeout failures", async () => {
    const onTranscription = vi.fn();
    transcribeAudioMock.mockRejectedValue(
      new AxiosError("timeout", "ECONNABORTED"),
    );

    const { result } = renderHook(() =>
      useAudioDictation({ mode: "journal_note", onTranscription }),
    );

    await act(async () => {
      await result.current.startDictation();
    });

    act(() => {
      result.current.stopDictation();
    });

    await waitFor(() => {
      expect(result.current.errorMessage).toBe(
        "Transcription timed out. Please try again.",
      );
    });
    expect(result.current.status).toBe("idle");
    expect(onTranscription).not.toHaveBeenCalled();
  });

  it("surfaces errors for unavailable selected microphones", async () => {
    const onTranscription = vi.fn();
    getUserMediaMock.mockRejectedValue(
      new DOMException("Requested device not found", "NotFoundError"),
    );

    const { result } = renderHook(() =>
      useAudioDictation({
        mode: "loopie",
        onTranscription,
        audioInputDeviceId: "missing-device",
      }),
    );

    await act(async () => {
      await result.current.startDictation();
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.errorMessage).toBe(
      "Selected microphone is unavailable. Choose another microphone and try again.",
    );
    expect(onTranscription).not.toHaveBeenCalled();
  });
});
