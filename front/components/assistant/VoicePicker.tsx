import { ActionMicIcon, Button, StopIcon } from "@dust-tt/sparkle";
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

  // Track pointer press to distinguish click (<150ms) vs hold (>=150ms).
  const pressStartRef = useRef<number | null>(null);
  const pressTimeoutRef = useRef<number | null>(null);

  const sendNotification = useSendNotification();

  // Cleanup on unmounting: ensure the recorder is stopped and tracks are closed.
  useEffect(() => {
    return () => {
      // Clear any pending press timeout.
      clearPressTimeout();
      pressStartRef.current = null;
      stopRecorder(mediaRecorderRef.current);
      stopTracks(streamRef.current);
    };
  }, []);

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

      recorder.start();
      setIsRecording(true);
    } catch {
      sendNotification({
        type: "error",
        title: "Microphone permission required.",
        description: "Please allow microphone access and try again.",
      });
    }
  }, [isRecording, sendNotification]);

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
        stopTracks(streamRef.current);
        streamRef.current = null;
      }
    },
    [finalizeRecordingHold, finalizeRecordingClick, sendNotification]
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

  return (
    <Button
      icon={isRecording ? StopIcon : ActionMicIcon}
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
