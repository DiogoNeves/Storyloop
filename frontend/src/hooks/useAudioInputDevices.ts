import { useCallback, useEffect, useMemo, useState } from "react";

const DEFAULT_AUDIO_INPUT_DEVICE_ID = "default";
const DEFAULT_AUDIO_INPUT_DEVICE_LABEL = "System default microphone";
const AUDIO_INPUT_DEVICE_STORAGE_KEY = "storyloop.audioInputDeviceId";
const TRAILING_HARDWARE_CODE_PATTERN = /\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i;

export interface AudioInputDeviceOption {
  deviceId: string;
  label: string;
}

interface UseAudioInputDevicesResult {
  audioInputDevices: AudioInputDeviceOption[];
  selectedAudioInputDeviceId: string;
  isSupported: boolean;
  selectAudioInputDevice: (deviceId: string) => void;
  refreshAudioInputDevices: () => Promise<void>;
}

export function useAudioInputDevices(): UseAudioInputDevicesResult {
  const [audioInputDevices, setAudioInputDevices] = useState<AudioInputDeviceOption[]>(
    [],
  );
  const [selectedAudioInputDeviceId, setSelectedAudioInputDeviceId] = useState(
    loadInitialAudioInputDeviceId,
  );

  const isSupported =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.enumerateDevices === "function";

  const refreshAudioInputDevices = useCallback(async () => {
    if (!isSupported) {
      setAudioInputDevices([]);
      setSelectedAudioInputDeviceId(DEFAULT_AUDIO_INPUT_DEVICE_ID);
      return;
    }

    let devices: MediaDeviceInfo[];
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch {
      setAudioInputDevices([createDefaultAudioInputDeviceOption()]);
      setSelectedAudioInputDeviceId(DEFAULT_AUDIO_INPUT_DEVICE_ID);
      persistAudioInputDeviceId(DEFAULT_AUDIO_INPUT_DEVICE_ID);
      return;
    }

    const discovered = devices
      .filter((device) => device.kind === "audioinput")
      .map((device, index) => ({
        deviceId:
          device.deviceId && device.deviceId.length > 0
            ? device.deviceId
            : DEFAULT_AUDIO_INPUT_DEVICE_ID,
        label:
          device.label && device.label.trim().length > 0
            ? normalizeAudioInputDeviceLabel(device.label)
              : index === 0
              ? DEFAULT_AUDIO_INPUT_DEVICE_LABEL
              : `Microphone ${index + 1}`,
      }));

    const hasDefault = discovered.some(
      (device) => device.deviceId === DEFAULT_AUDIO_INPUT_DEVICE_ID,
    );
    const normalizedDevices = hasDefault
      ? discovered
      : [
          {
            deviceId: DEFAULT_AUDIO_INPUT_DEVICE_ID,
            label: DEFAULT_AUDIO_INPUT_DEVICE_LABEL,
          },
          ...discovered,
        ];
    setAudioInputDevices(normalizedDevices);

    if (normalizedDevices.length === 0) {
      setSelectedAudioInputDeviceId(DEFAULT_AUDIO_INPUT_DEVICE_ID);
      persistAudioInputDeviceId(DEFAULT_AUDIO_INPUT_DEVICE_ID);
      return;
    }

    const selectedDeviceExists = normalizedDevices.some(
      (device) => device.deviceId === selectedAudioInputDeviceId,
    );
    if (selectedDeviceExists) {
      return;
    }

    const nextSelectedDeviceId = normalizedDevices[0].deviceId;
    setSelectedAudioInputDeviceId(nextSelectedDeviceId);
    persistAudioInputDeviceId(nextSelectedDeviceId);
  }, [isSupported, selectedAudioInputDeviceId]);

  useEffect(() => {
    if (!isSupported) {
      return;
    }
    void refreshAudioInputDevices();
  }, [isSupported, refreshAudioInputDevices]);

  useEffect(() => {
    if (!isSupported) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshAudioInputDevices();
      }
    };
    const handleFocus = () => {
      void refreshAudioInputDevices();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [isSupported, refreshAudioInputDevices]);

  const selectAudioInputDevice = useCallback((deviceId: string) => {
    const nextDeviceId =
      deviceId && deviceId.trim().length > 0
        ? deviceId
        : DEFAULT_AUDIO_INPUT_DEVICE_ID;
    setSelectedAudioInputDeviceId(nextDeviceId);
    persistAudioInputDeviceId(nextDeviceId);
  }, []);

  return useMemo(
    () => ({
      audioInputDevices,
      selectedAudioInputDeviceId,
      isSupported,
      selectAudioInputDevice,
      refreshAudioInputDevices,
    }),
    [
      audioInputDevices,
      selectedAudioInputDeviceId,
      isSupported,
      selectAudioInputDevice,
      refreshAudioInputDevices,
    ],
  );
}

function loadInitialAudioInputDeviceId(): string {
  if (typeof window === "undefined") {
    return DEFAULT_AUDIO_INPUT_DEVICE_ID;
  }

  try {
    const saved = window.localStorage.getItem(AUDIO_INPUT_DEVICE_STORAGE_KEY);
    if (saved && saved.trim().length > 0) {
      return saved;
    }
  } catch {
    return DEFAULT_AUDIO_INPUT_DEVICE_ID;
  }

  return DEFAULT_AUDIO_INPUT_DEVICE_ID;
}

function persistAudioInputDeviceId(deviceId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(AUDIO_INPUT_DEVICE_STORAGE_KEY, deviceId);
  } catch {
    // Ignore storage errors (e.g. restricted browser privacy modes).
  }
}

function createDefaultAudioInputDeviceOption(): AudioInputDeviceOption {
  return {
    deviceId: DEFAULT_AUDIO_INPUT_DEVICE_ID,
    label: DEFAULT_AUDIO_INPUT_DEVICE_LABEL,
  };
}

function normalizeAudioInputDeviceLabel(label: string): string {
  const trimmedLabel = label.trim();
  if (trimmedLabel.length === 0) {
    return DEFAULT_AUDIO_INPUT_DEVICE_LABEL;
  }

  const normalizedLabel = trimmedLabel.replace(TRAILING_HARDWARE_CODE_PATTERN, "").trim();
  return normalizedLabel.length > 0 ? normalizedLabel : DEFAULT_AUDIO_INPUT_DEVICE_LABEL;
}
