/// <reference types="chrome" />
import {
  isBrowserExtension,
  isChromeExtension,
  isFirefoxExtension,
} from "@app/lib/utils/extension";
import type { MutableRefObject } from "react";
import { useEffect, useState } from "react";

export const SAMPLE_RATE_HZ = 16_000;

const MICROPHONE_POPUP_TIMEOUT_MS = 60_000; // 1 minute

export type VoiceTranscriberStatus =
  | "idle"
  | "authorizing_microphone"
  | "recording"
  | "transcribing";

export interface VoiceTranscriberService {
  status: VoiceTranscriberStatus;
  level: number;
  elapsedSeconds: number;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
}

export const quackingVoiceTranscriptService: VoiceTranscriberService = {
  status: "idle",
  level: 0,
  elapsedSeconds: 0,
  startRecording: () => Promise.resolve(),
  stopRecording: () => Promise.resolve(),
};

export function useElapsedSeconds(status: VoiceTranscriberStatus): number {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (status === "recording") {
      interval = setInterval(() => setElapsedSeconds((prev) => prev + 1), 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [status]);
  return elapsedSeconds;
}

// Type guard to check for prefixed webkitAudioContext without unsafe casts.
export function hasWebkitAudioContext(
  w: Window & typeof globalThis
  // @ts-expect-error - Type 'Window' is not assignable to type 'Window & typeof globalThis'.
): w is Window & { webkitAudioContext: typeof AudioContext } {
  return "webkitAudioContext" in w;
}

export function startLevelMeteringInterval(
  analyser: AnalyserNode,
  analyserRef: MutableRefObject<AnalyserNode | null>,
  setLevel: (v: number) => void
): NodeJS.Timeout {
  const buffer = new Uint8Array(analyser.frequencyBinCount);
  return setInterval(() => {
    const a = analyserRef.current;
    if (!a) {
      return;
    }
    a.getByteTimeDomainData(buffer);
    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i++) {
      const v = (buffer[i] - 128) / 128;
      sumSquares += v * v;
    }
    const rms = Math.sqrt(sumSquares / buffer.length);
    setLevel(Math.max(0, Math.min(1, (rms - 0.02) / 0.3)));
  }, 250);
}

export const requestMicrophone = async (): Promise<MediaStream> => {
  if (isBrowserExtension()) {
    return extensionRequestMicrophonePermission();
  }
  return navigator.mediaDevices.getUserMedia({
    audio: {
      noiseSuppression: true, // filter out background noise
      echoCancellation: true, // prevent mic from picking up speaker output
      autoGainControl: true, // normalize volume
    },
  });
};

const extensionRequestMicrophonePermission = async (): Promise<MediaStream> => {
  const state = await getMicrophonePermissionState();

  if (state === "denied") {
    if (isChromeExtension()) {
      // Open Chrome extension settings so user can manually re-enable microphone.
      await chrome.tabs.create({
        url: `chrome://settings/content/siteDetails?site=chrome-extension%3A%2F%2F${chrome.runtime.id}%2F`,
      });
    }
    // Firefox has no deep link to extension site settings
    throw new DOMException("Microphone permission denied", "NotAllowedError");
  }

  if (state === "prompt") {
    // Side panel can't show the prompt — fall back to popup window
    await openMicrophoneAccessPopup();
    const newState = await getMicrophonePermissionState();
    if (newState !== "granted") {
      throw new DOMException(
        "Microphone permission not granted",
        "NotAllowedError"
      );
    }
    return navigator.mediaDevices.getUserMedia({ audio: true });
  }
  // Permission is already granted
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    // Firefox bug: when the microphone permission is set to "Always Ask",
    // navigator.permissions.query incorrectly reports the state as "granted"
    // instead of "prompt". This causes getUserMedia to fail in the side panel
    // (which cannot display the native permission prompt). We fall back to the
    // popup flow so the user can still grant access.
    if (
      isFirefoxExtension() &&
      error instanceof DOMException &&
      error.name === "NotAllowedError"
    ) {
      await openMicrophoneAccessPopup();
      const newState = await getMicrophonePermissionState();
      if (newState !== "granted") {
        throw new DOMException(
          "Microphone permission not granted",
          "NotAllowedError"
        );
      }
      return navigator.mediaDevices.getUserMedia({ audio: true });
    }
    throw error;
  }
};

const getMicrophonePermissionState = async (): Promise<PermissionState> => {
  const status = await navigator.permissions.query({
    name: "microphone",
  });
  return status.state;
};

const openMicrophoneAccessPopup = async (): Promise<void> => {
  const createdWindow = await chrome.windows.create({
    url: chrome.runtime.getURL("request-mic.html"),
    type: "popup",
    width: 400,
    height: 400,
  });

  if (!createdWindow?.id) {
    return;
  }

  const windowId = createdWindow.id;

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.windows.onRemoved.removeListener(onWindowClose);
      chrome.windows.remove(windowId);
      reject(new Error("Microphone access popup timed out"));
    }, MICROPHONE_POPUP_TIMEOUT_MS);

    function onWindowClose(closedWindowId: number) {
      if (closedWindowId === windowId) {
        clearTimeout(timeout);
        chrome.windows.onRemoved.removeListener(onWindowClose);
        resolve();
      }
    }

    chrome.windows.onRemoved.addListener(onWindowClose);
  });
};
