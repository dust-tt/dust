import type { MutableRefObject } from "react";
import { useEffect, useState } from "react";

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
