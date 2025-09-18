import { Button, cn, MicIcon, SquareIcon } from "@dust-tt/sparkle";
import React, { useRef, useState } from "react";

import type { VoiceTranscriberService } from "@app/hooks/useVoiceTranscriberService";

// Component intent:
// - Supports two recording interaction patterns:
//   - "hold": Press and hold to record, release to stop and transcribe immediately.
//   - "click": Click to start recording, click again to stop and add as an attachment.
// - Shows a loading state while transcribing and sends notifications on success/failure.

interface VoicePickerProps {
  voiceTranscriberService: VoiceTranscriberService;
  disabled?: boolean;
}

export function VoicePicker({
  voiceTranscriberService,
  disabled = false,
}: VoicePickerProps) {
  const [mode, setMode] = useState<"hold" | "click">("hold");

  // Track pointer press to distinguish click (<150ms) vs hold (>=150ms).
  const pressStartRef = useRef<number | null>(null);
  const pressTimeoutRef = useRef<number | null>(null);

  const clearPressTimeout = () => {
    if (pressTimeoutRef.current !== null) {
      window.clearTimeout(pressTimeoutRef.current);
      pressTimeoutRef.current = null;
    }
  };

  // ----- Event handlers -------------------------------------------------------
  const handlePointerDown = async () => {
    if (disabled) {
      return;
    }
    // Mark the start time of the press.
    pressStartRef.current = Date.now();

    // Schedule transition to hold mode if press lasts >= 150 ms.
    clearPressTimeout();
    pressTimeoutRef.current = window.setTimeout(async () => {
      // If still pressed, enter hold mode and start recording.
      if (pressStartRef.current !== null) {
        setMode("hold");
        if (!voiceTranscriberService.isRecording) {
          await voiceTranscriberService.startRecording();
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
      if (!voiceTranscriberService.isRecording) {
        await voiceTranscriberService.startRecording();
        return;
      }
      await voiceTranscriberService.stopRecording("attachment");
      return;
    }

    // Hold mode: release stops the recording if active.
    if (voiceTranscriberService.isRecording) {
      await voiceTranscriberService.stopRecording("transcribe");
    }
  };

  const handlePointerLeave = async () => {
    if (disabled || mode !== "hold") {
      return;
    }
    if (voiceTranscriberService.isRecording) {
      await voiceTranscriberService.stopRecording("transcribe");
    }
  };

  const handlePointerClick = async () => {
    if (disabled || mode !== "click") {
      return;
    }
    if (voiceTranscriberService.isRecording) {
      await voiceTranscriberService.stopRecording("attachment");
    }
  };

  return (
    <>
      <div
        className={cn(
          "duration-600 flex items-center justify-end gap-2 overflow-hidden px-2 transition-all ease-in-out",
          voiceTranscriberService.isRecording
            ? "w-32 opacity-100"
            : "w-8 opacity-0"
        )}
      >
        <div className="heading-xs font-mono">
          {formatTime(voiceTranscriberService.elapsedSeconds)}
        </div>
        <VoiceLevelDisplay level={voiceTranscriberService.level} />
      </div>
      <Button
        size="xs"
        icon={voiceTranscriberService.isRecording ? SquareIcon : MicIcon}
        isLoading={voiceTranscriberService.isTranscribing}
        variant={
          voiceTranscriberService.isRecording ? "highlight" : "ghost-secondary"
        }
        tooltip={computeTooltip(
          mode,
          voiceTranscriberService.isRecording,
          voiceTranscriberService.isTranscribing
        )}
        label={voiceTranscriberService.isRecording ? "Stop" : undefined}
        disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onClick={handlePointerClick}
      />
    </>
  );
}

const computeTooltip = (
  mode: string,
  isRecording: boolean,
  isTranscribing: boolean
): string => {
  if (isTranscribing) {
    return "Transcribing...";
  }
  if (mode === "hold" && isRecording) {
    return "Release to stop";
  }
  return isRecording ? "Stop recording" : "Click, or Press & Hold to record";
};

interface VoiceLevelIconProps {
  level: number; // Expected in [0, 1].
}

const VoiceLevelDisplay = ({ level }: VoiceLevelIconProps) => {
  // Clamp and ease the level a bit for smoother visuals.
  const l = Math.max(0, Math.min(1, level * 1.2));
  const eased = Math.pow(l, 0.8);

  // Base shape (percent heights) taken from the template.
  const base = [22, 33, 18, 64, 98, 56, 6, 34, 76, 46, 12, 22];

  // Minimal visible heights to keep subtle motion when quiet.
  const minHeights = base.map((b) => Math.max(6, Math.round(b * 0.3)));

  // Interpolate between minimal and base depending on the current level.
  const heights = base.map((b, i) =>
    Math.max(
      1,
      Math.min(100, Math.round(minHeights[i] + (b - minHeights[i]) * eased))
    )
  );

  return (
    <div className="flex h-5 items-center gap-0.5">
      {heights.map((h, i) => (
        <div
          // Only the height varies according to the level; the rest matches the template.
          key={i}
          className="min-h-1 w-0.5 rounded-full bg-muted-foreground"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
};

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};
