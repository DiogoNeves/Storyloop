import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAudioInputDevices } from "@/hooks/useAudioInputDevices";

describe("useAudioInputDevices", () => {
  const enumerateDevicesMock = vi.fn();

  beforeEach(() => {
    enumerateDevicesMock.mockReset();
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: enumerateDevicesMock,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to default when localStorage access throws", async () => {
    enumerateDevicesMock.mockResolvedValue([]);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });

    const { result } = renderHook(() => useAudioInputDevices());

    expect(result.current.selectedAudioInputDeviceId).toBe("default");
    await waitFor(() => {
      expect(result.current.audioInputDevices).toEqual([
        { deviceId: "default", label: "System default microphone" },
      ]);
    });
  });

  it("handles enumerateDevices failures without unhandled rejections", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue("saved-device-id");
    enumerateDevicesMock.mockRejectedValue(new DOMException("Denied", "NotAllowedError"));

    const { result } = renderHook(() => useAudioInputDevices());

    await waitFor(() => {
      expect(result.current.audioInputDevices).toEqual([
        { deviceId: "default", label: "System default microphone" },
      ]);
    });
    expect(result.current.selectedAudioInputDeviceId).toBe("default");
  });

  it("ignores storage write errors when selecting a device", async () => {
    enumerateDevicesMock.mockResolvedValue([
      {
        deviceId: "mic-1",
        kind: "audioinput",
        label: "USB Mic",
        groupId: "group-1",
        toJSON: () => ({}),
      } as MediaDeviceInfo,
    ]);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });

    const { result } = renderHook(() => useAudioInputDevices());

    await waitFor(() => {
      expect(result.current.audioInputDevices.some((device) => device.deviceId === "mic-1")).toBe(true);
    });

    await act(async () => {
      result.current.selectAudioInputDevice("mic-1");
      await Promise.resolve();
    });

    expect(result.current.selectedAudioInputDeviceId).toBe("mic-1");
  });
});
