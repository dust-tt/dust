import type {
  ButtonProps,
  RegularButtonSize,
} from "@sparkle/components/Button";
import { Button } from "@sparkle/components/Button";
import { useTranscribingProgress } from "@sparkle/hooks/useTranscribingProgress";
import { Microphone01, Square } from "@sparkle/icons/v2-stroke";
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
  compact?: boolean;
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
  compact = false,
  pressDelayMs = DEFAULT_PRESS_DELAY_MS,
  buttonProps,
}: VoicePickerProps): React.ReactElement {
  const [interactionMode, setInteractionMode] =
    React.useState<VoicePickerInteractionMode>("hold");
  const interactionModeRef = React.useRef<VoicePickerInteractionMode>("hold");
  const pressStartRef = React.useRef<number | null>(null);
  const pressTimeoutRef = React.useRef<number | null>(null);
  const suppressNextClickRef = React.useRef(false);
  const ignoreLeaveUntilRef = React.useRef(0);

  const setMode = (mode: VoicePickerInteractionMode): void => {
    interactionModeRef.current = mode;
    setInteractionMode(mode);
  };

  const markRecordingStarted = (): void => {
    ignoreLeaveUntilRef.current = Date.now() + 300;
  };

  const isRecording = status === "recording";
  const isTranscribing = status === "transcribing";
  const isLoading = status === "authorizing_microphone";
  const shouldShowStop = isRecording && interactionMode === "click";

  const lastRecordingSecondsRef = React.useRef(0);
  React.useEffect(() => {
    if (isRecording) {
      lastRecordingSecondsRef.current = elapsedSeconds;
    }
  }, [isRecording, elapsedSeconds]);

  const transcribingProgress = useTranscribingProgress({
    isTranscriptingInProgress: isTranscribing,
    recordingSeconds: lastRecordingSecondsRef.current,
  });

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

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignore if pointer capture is not supported.
    }

    pressStartRef.current = Date.now();

    clearPressTimeout();
    pressTimeoutRef.current = window.setTimeout(async () => {
      if (pressStartRef.current !== null) {
        setMode("hold");
        if (status === "idle") {
          await onRecordStart();
          markRecordingStarted();
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

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore if pointer capture was not set.
    }

    const duration =
      start === null ? Number.POSITIVE_INFINITY : Date.now() - start;

    if (duration < pressDelayMs) {
      setMode("click");
      if (status === "idle") {
        suppressNextClickRef.current = true;
        await onRecordStart();
        markRecordingStarted();
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

    if (
      disabled ||
      interactionModeRef.current !== "hold" ||
      status !== "recording"
    ) {
      return;
    }

    if (Date.now() < ignoreLeaveUntilRef.current) {
      return;
    }

    stopEvent(event);

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

    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }

    if (disabled || interactionModeRef.current !== "click") {
      return;
    }
    if (status === "recording") {
      await onRecordStop();
    }
  }

  const icon = shouldShowStop ? Square : Microphone01;
  const variant = shouldShowStop ? "highlight" : "ghost-secondary";
  const label = isTranscribing
    ? `${transcribingProgress ?? 0}%`
    : shouldShowStop && showStopLabel
      ? "Stop"
      : undefined;
  const tooltip = computeTooltip(interactionMode, isRecording, isTranscribing);

  return (
    <div className="s-flex s-items-center">
      <div
        className={cn(
          "s-duration-600 s-flex s-items-center s-justify-end s-gap-2 s-overflow-hidden s-transition-all s-ease-in-out",
          compact ? "s-px-1" : "s-px-2",
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
        disabled={disabled || isTranscribing}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
      />
    </div>
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
