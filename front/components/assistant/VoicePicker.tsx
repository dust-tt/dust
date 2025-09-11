import { ActionMicIcon, Button } from "@dust-tt/sparkle";
import type { MutableRefObject } from "react";
import React, { useCallback, useEffect, useRef, useState } from "react";

import type { FileUploaderService } from "@app/hooks/useFileUploaderService";
import { useSendNotification } from "@app/hooks/useNotification";
import type { WorkspaceType } from "@app/types";

// Component intent:
// - Supports two recording interaction patterns:
//   - "hold": Press and hold to record, release to stop and transcribe immediately.
//   - "click": Click to start recording, click again to stop and add as an attachment.
// - Shows a loading state while transcribing and sends notifications on success/failure.

interface VoicePickerProps {
  owner: WorkspaceType;
  fileUploaderService: FileUploaderService;
  onTranscribeDelta: (delta: string) => void;
  disabled?: boolean;
}

export function VoicePicker({
  owner,
  fileUploaderService,
  onTranscribeDelta,
  disabled = false,
}: VoicePickerProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [mode, setMode] = useState<"hold" | "click">("hold");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const [level, setLevel] = useState(0);

  // Track pointer press to distinguish click (<150ms) vs hold (>=150ms).
  const pressStartRef = useRef<number | null>(null);
  const pressTimeoutRef = useRef<number | null>(null);

  const sendNotification = useSendNotification();

  const stopLevelMetering = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try {
      analyserRef.current = null;
      sourceNodeRef.current?.disconnect();
      sourceNodeRef.current = null;
      if (audioContextRef.current) {
        // Close the AudioContext to release resources.
        void audioContextRef.current.close();
      }
    } catch {
      // Ignore errors on cleanup.
    } finally {
      audioContextRef.current = null;
      setLevel(0);
    }
  }, []);

  const startLevelMetering = useCallback(
    (stream: MediaStream) => {
      stopLevelMetering();
      try {
        const AC = hasWebkitAudioContext(window)
          ? window.webkitAudioContext
          : window.AudioContext;
        const ctx = new AC();
        audioContextRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.85;
        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
        analyserRef.current = analyser;
        sourceNodeRef.current = source;

        const buffer = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          const a = analyserRef.current;
          if (!a) {
            return;
          }
          a.getByteTimeDomainData(buffer);
          // Compute RMS level from time-domain data. Normalize to [0, 1].
          let sumSquares = 0;
          for (let i = 0; i < buffer.length; i++) {
            const v = (buffer[i] - 128) / 128; // [-1, 1]
            sumSquares += v * v;
          }
          const rms = Math.sqrt(sumSquares / buffer.length); // ~0..1
          // Map RMS to a smoother visual level with light bias to show activity.
          const visual = Math.max(0, Math.min(1, (rms - 0.02) / 0.3));
          setLevel(visual);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        // If metering fails (unsupported), we silently ignore.
        audioContextRef.current = null;
        analyserRef.current = null;
      }
    },
    [stopLevelMetering]
  );

  // Cleanup on unmounting: ensure the recorder is stopped and tracks are closed.
  useEffect(() => {
    return () => {
      // Clear any pending press timeout.
      clearPressTimeout();
      pressStartRef.current = null;
      stopRecorder(mediaRecorderRef.current);
      stopLevelMetering();
      stopTracks(streamRef.current);
    };
  }, [stopLevelMetering]);

  const finalizeRecordingHold = useCallback(
    async (file: File) => {
      const form = new FormData();
      form.append("file", file);

      const resp = await fetch(
        `/api/w/${owner.sId}/services/transcribe?stream=false`,
        { method: "POST", body: form }
      );

      if (!resp.ok) {
        const msg = await resp.text();
        sendNotification({
          type: "error",
          title: "Voice upload failed.",
          description: msg || "Failed to send audio for transcription.",
        });
        return;
      }

      const res = (await resp.json()) as { text: string };
      onTranscribeDelta(res.text);
      sendNotification({
        type: "success",
        title: "Voice recorded.",
        description: "Audio sent for transcription.",
      });
    },
    [onTranscribeDelta, owner.sId, sendNotification]
  );

  const finalizeRecordingClick = useCallback(
    async (file: File) => {
      await fileUploaderService.handleFilesUpload([file]);
      sendNotification({
        type: "success",
        title: "Attachment added.",
        description: "Your voice message was added to attachments.",
      });
    },
    [fileUploaderService, sendNotification]
  );

  const clearPressTimeout = () => {
    if (pressTimeoutRef.current !== null) {
      window.clearTimeout(pressTimeoutRef.current);
      pressTimeoutRef.current = null;
    }
  };

  // ----- Recording flow -------------------------------------------------------

  const startRecording = useCallback(async () => {
    if (isRecording) {
      return;
    }
    try {
      const stream = await requestMicrophone();
      streamRef.current = stream;

      const recorder = createRecorder(stream, chunksRef);
      mediaRecorderRef.current = recorder;

      // Start level metering alongside recording.
      startLevelMetering(stream);

      recorder.start();
      setIsRecording(true);
    } catch {
      sendNotification({
        type: "error",
        title: "Microphone permission required.",
        description: "Please allow microphone access and try again.",
      });
    }
  }, [isRecording, sendNotification, startLevelMetering]);

  const stopAndFinalize = useCallback(
    async (reason: "hold" | "click") => {
      setIsRecording(false);
      setIsTranscribing(true);

      try {
        const file = buildAudioFile(chunksRef.current);
        chunksRef.current = [];

        if (reason === "hold") {
          await finalizeRecordingHold(file);
        } else {
          await finalizeRecordingClick(file);
        }
      } catch (e) {
        sendNotification({
          type: "error",
          title: "Recording error.",
          description:
            e instanceof Error ? e.message : "An unknown error occurred.",
        });
      } finally {
        setIsTranscribing(false);
        stopLevelMetering();
        stopTracks(streamRef.current);
        streamRef.current = null;
      }
    },
    [
      finalizeRecordingHold,
      finalizeRecordingClick,
      sendNotification,
      stopLevelMetering,
    ]
  );

  const stopRecording = useCallback(
    async (reason: "hold" | "click") => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        return;
      }

      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });

      recorder.stop();
      await stopped;
      await stopAndFinalize(reason);
    },
    [stopAndFinalize]
  );

  // ----- Event handlers -------------------------------------------------------

  // Type guard to check for prefixed webkitAudioContext without unsafe casts.

  function hasWebkitAudioContext(
    w: Window & typeof globalThis
    // @ts-expect-error - Type 'Window' is not assignable to type 'Window & typeof globalThis'.
  ): w is Window & { webkitAudioContext: typeof AudioContext } {
    return "webkitAudioContext" in w;
  }

  // ----- Level metering (audio input visualization) ----------------------------

  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // ----- Event handlers -------------------------------------------------------

  const handlePointerDown = async () => {
    if (disabled) {
      return;
    }
    // Mark the start time of the press.
    pressStartRef.current = Date.now();

    // Schedule transition to hold mode if press lasts >= 150ms.
    clearPressTimeout();
    pressTimeoutRef.current = window.setTimeout(async () => {
      // If still pressed, enter hold mode and start recording.
      if (pressStartRef.current !== null) {
        setMode("hold");
        if (!isRecording) {
          await startRecording();
        }
      }
    }, 150);
  };

  const handlePointerUp = async () => {
    if (disabled) {
      return;
    }

    const start = pressStartRef.current;
    // Clear press state and timeout.
    clearPressTimeout();
    pressStartRef.current = null;

    const now = Date.now();
    const duration = typeof start === "number" ? now - start : Infinity;

    if (duration < 150) {
      // Click mode: toggle start/stop on click.
      setMode("click");
      if (!isRecording) {
        await startRecording();
        return;
      }
      await stopRecording("click");
      return;
    }

    // Hold mode: release stops the recording if active.
    if (isRecording) {
      await stopRecording("hold");
    }
  };

  const handlePointerLeave = async () => {
    if (disabled || mode !== "hold") {
      return;
    }
    if (isRecording) {
      await stopRecording("hold");
    }
  };

  const handlePointerClick = async () => {
    if (disabled || mode !== "click") {
      return;
    }
    if (isRecording) {
      await stopRecording("click");
    }
  };

  // ----- Render ---------------------------------------------------------------

  // Use a dynamic recording icon that reflects the input level when recording.
  const RecordingIcon = () => <VoiceLevelIcon level={level} />;

  return (
    <Button
      icon={isRecording ? RecordingIcon : ActionMicIcon}
      isLoading={isTranscribing}
      variant="ghost-secondary"
      size="xs"
      tooltip={computeTooltip(mode, isRecording, isTranscribing)}
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onClick={handlePointerClick}
    />
  );
}

const stopTracks = (stream: MediaStream | null) => {
  if (!stream) {
    return;
  }
  stream.getTracks().forEach((t) => t.stop());
};

const stopRecorder = (recorder: MediaRecorder | null) => {
  if (!recorder) {
    return;
  }
  if (recorder.state !== "inactive") {
    recorder.stop();
  }
};

const buildAudioFile = (chunks: Blob[]) => {
  const blob = new Blob(chunks, { type: "audio/webm" });
  const filename = `voice-${new Date().toISOString()}.webm`;

  return new File([blob], filename, { type: "audio/webm" });
};

const requestMicrophone = async (): Promise<MediaStream> => {
  return navigator.mediaDevices.getUserMedia({ audio: true });
};

const createRecorder = (
  stream: MediaStream,
  chunksRef: MutableRefObject<Blob[]>
): MediaRecorder => {
  const recorder = new MediaRecorder(stream, {
    mimeType: "audio/webm;codecs=opus",
  });
  chunksRef.current = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunksRef.current.push(e.data);
    }
  };
  // onstop is handled by whoever calls `stop()`.
  return recorder;
};

const computeTooltip = (
  mode: string,
  isRecording: boolean,
  isTranscribing: boolean
): string => {
  if (isTranscribing) {
    return "Transcribing...";
  }
  if (mode === "hold") {
    return isRecording ? "Release to stop" : "Hold to record";
  }
  return isRecording ? "Click to stop" : "Click to record";
};

interface VoiceLevelIconProps {
  level: number; // Expected in [0, 1].
}

// Sparkle-consistent dynamic icon that visualizes the input level using bars.
// - Uses currentColor for fill, so it inherits Button color.
// - Sized with 1em so it matches the icon size expected by Button.
// - Bars heights are smoothly mapped from the provided level.
const VoiceLevelIcon = ({ level }: VoiceLevelIconProps) => {
  // Clamp to [0,1] to be safe.
  const l = Math.max(0, Math.min(1, level * 1.5));

  // Compute heights for 5 bars with slight variance.
  const base = 3; // Minimum bar height.
  const max = 16; // Additional height available.
  const factors = [0.4, 0.7, 1.0, 0.7, 0.4];
  const heights = factors.map((f) => base + max * Math.pow(l, 0.7) * f);

  // X positions for the bars in the 24x24 viewBox.
  const xs = [5, 9, 13, 17, 21];
  const bottom = 21; // Bottom baseline (y coordinate).
  const width = 2; // Bar width.

  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {heights.map((h, i) => (
        <rect
          key={i}
          x={xs[i] - width / 2}
          width={width}
          y={bottom - h}
          height={h}
          rx={1}
        />
      ))}
    </svg>
  );
};
