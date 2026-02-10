/** biome-ignore-all lint/nursery/noImportCycles: I'm too lazy to fix that now */

import type {
  ButtonProps,
  RegularButtonSize,
} from "@sparkle/components/Button";
import { Button } from "@sparkle/components/Button";
import { MicIcon, SquareIcon } from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";
import * as React from "react";

const DEFAULT_PRESS_DELAY_MS = 150;
const VOICE_LEVEL_BASE_HEIGHTS = [
  22, 33, 18, 64, 98, 56, 6, 34, 76, 46, 12, 22,
];

export type VoicePickerStatus =
  | "idle"
  | "authorizing_microphone"
  | "recording"
  | "transcribing";

type VoicePickerInteractionMode = "hold" | "click";

export interface VoicePickerProps {
  status: VoicePickerStatus;
  level: number;
  elapsedSeconds: number;
  onRecordStart: () => void | Promise<void>;
  onRecordStop: () => void | Promise<void>;
  size?: Exclude<RegularButtonSize, "xmini" | "mini">;
  disabled?: boolean;
  showStopLabel?: boolean;
  pressDelayMs?: number;
  buttonProps?: Omit<
    ButtonProps,
    "icon" | "label" | "variant" | "isLoading" | "disabled" | "size"
  >;
}

export function VoicePicker({
  status,
  level,
  elapsedSeconds,
  onRecordStart,
  onRecordStop,
  size = "xs",
  disabled = false,
  showStopLabel = false,
  pressDelayMs = DEFAULT_PRESS_DELAY_MS,
  buttonProps,
}: VoicePickerProps): React.ReactElement {
  const [interactionMode, setInteractionMode] =
    React.useState<VoicePickerInteractionMode>("hold");
  const pressStartRef = React.useRef<number | null>(null);
  const pressTimeoutRef = React.useRef<number | null>(null);

  const isRecording = status === "recording";
  const isTranscribing = status === "transcribing";
  const isLoading =
    status === "transcribing" || status === "authorizing_microphone";
  const shouldShowStop = isRecording && interactionMode === "click";

  function clearPressTimeout(): void {
    if (pressTimeoutRef.current !== null) {
      window.clearTimeout(pressTimeoutRef.current);
      pressTimeoutRef.current = null;
    }
  }

  function stopEvent(event: React.SyntheticEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  async function handlePointerDown(
    event: React.PointerEvent<HTMLButtonElement>
  ): Promise<void> {
    buttonProps?.onPointerDown?.(event);
    if (event.defaultPrevented) {
      return;
    }

    stopEvent(event);

    if (disabled) {
      return;
    }

    pressStartRef.current = Date.now();

    clearPressTimeout();
    pressTimeoutRef.current = window.setTimeout(async () => {
      if (pressStartRef.current !== null) {
        setInteractionMode("hold");
        if (status === "idle") {
          await onRecordStart();
        }
      }
    }, pressDelayMs);
  }

  async function handlePointerUp(
    event: React.PointerEvent<HTMLButtonElement>
  ): Promise<void> {
    buttonProps?.onPointerUp?.(event);
    if (event.defaultPrevented) {
      return;
    }

    stopEvent(event);

    if (disabled) {
      return;
    }

    const start = pressStartRef.current;
    clearPressTimeout();
    pressStartRef.current = null;

    const duration =
      start === null ? Number.POSITIVE_INFINITY : Date.now() - start;

    if (duration < pressDelayMs) {
      setInteractionMode("click");
      if (status === "idle") {
        await onRecordStart();
        return;
      }
      await onRecordStop();
      return;
    }

    if (status === "recording") {
      await onRecordStop();
    }
  }

  async function handlePointerLeave(
    event: React.PointerEvent<HTMLButtonElement>
  ): Promise<void> {
    buttonProps?.onPointerLeave?.(event);
    if (event.defaultPrevented) {
      return;
    }

    stopEvent(event);

    if (disabled || interactionMode !== "hold") {
      return;
    }
    if (status === "recording") {
      await onRecordStop();
    }
  }

  async function handleClick(
    event: React.MouseEvent<HTMLButtonElement>
  ): Promise<void> {
    buttonProps?.onClick?.(event);
    if (event.defaultPrevented) {
      return;
    }

    stopEvent(event);

    if (disabled || interactionMode !== "click") {
      return;
    }
    if (status === "recording") {
      await onRecordStop();
    }
  }

  const icon = shouldShowStop ? SquareIcon : MicIcon;
  const variant = shouldShowStop ? "highlight" : "ghost-secondary";
  const label = shouldShowStop && showStopLabel ? "Stop" : undefined;
  const tooltip = computeTooltip(interactionMode, isRecording, isTranscribing);

  return (
    <>
      <div
        className={cn(
          "s-duration-600 s-flex s-items-center s-justify-end s-gap-2 s-overflow-hidden s-px-2 s-transition-all s-ease-in-out",
          isRecording ? "s-opacity-100" : "s-hidden"
        )}
      >
        <div className="s-heading-xs s-font-mono">
          {formatTime(elapsedSeconds)}
        </div>
        <VoiceLevelDisplay level={level} />
      </div>
      <Button
        {...buttonProps}
        size={size}
        icon={icon}
        isLoading={isLoading}
        variant={variant}
        tooltip={tooltip}
        label={label}
        disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
      />
    </>
  );
}

interface VoiceLevelDisplayProps {
  level: number;
}

function VoiceLevelDisplay({
  level,
}: VoiceLevelDisplayProps): React.ReactElement {
  const clampedLevel = Math.max(0, Math.min(1, level * 1.2));
  const easedLevel = Math.pow(clampedLevel, 0.8);

  const minHeights = VOICE_LEVEL_BASE_HEIGHTS.map((height) =>
    Math.max(6, Math.round(height * 0.3))
  );

  const heights = VOICE_LEVEL_BASE_HEIGHTS.map((height, index) =>
    Math.max(
      1,
      Math.min(
        100,
        Math.round(
          minHeights[index] + (height - minHeights[index]) * easedLevel
        )
      )
    )
  );

  return (
    <div className="s-flex s-h-5 s-items-center s-gap-0.5">
      {heights.map((height, index) => (
        <div
          key={index}
          className="s-min-h-1 s-w-0.5 s-rounded-full s-bg-muted-foreground s-transition-all s-duration-150 s-ease-out"
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
}

function computeTooltip(
  mode: VoicePickerInteractionMode,
  isRecording: boolean,
  isTranscribing: boolean
): string {
  if (isTranscribing) {
    return "Transcribing...";
  }
  if (mode === "hold" && isRecording) {
    return "Release to stop";
  }
  if (isRecording) {
    return "Stop recording";
  }
  return "Click, or Press & Hold to record";
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}
