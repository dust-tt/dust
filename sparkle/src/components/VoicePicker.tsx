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
  /** Current lifecycle state, owned by the caller: "idle" | "authorizing_microphone" | "recording" | "transcribing". */
  status: VoicePickerStatus;
  /** Live audio input level (0-1) driving the waveform display while recording. */
  level: number;
  /** Elapsed recording time, displayed as m:ss while recording. */
  elapsedSeconds: number;
  /** Called when a recording should start (press-and-hold begins, or a click while idle). */
  onRecordStart: () => void | Promise<void>;
  /** Called when the recording should stop (release, stop click, or pointer leaving in hold mode). */
  onRecordStop: () => void | Promise<void>;
  /** Button size: "xs" | "sm" | "md" (defaults to "xs"). */
  size?: Exclude<RegularButtonSize, "xmini" | "mini">;
  disabled?: boolean;
  /** Shows a "Stop" label on the button while recording in click-to-toggle mode. */
  showStopLabel?: boolean;
  /** Tightens the horizontal padding around the timer and waveform. */
  compact?: boolean;
  /** How long a press must be held (ms) before it counts as hold-to-record rather than a click toggle (defaults to 150). */
  pressDelayMs?: number;
  /** Extra props forwarded to the underlying Button. */
  buttonProps?: Omit<
    ButtonProps,
    "icon" | "label" | "variant" | "isLoading" | "disabled" | "size"
  >;
}

/**
 * A push-to-talk button for capturing voice and transcribing it to text. It is a
 * controlled component: own the recording lifecycle yourself, keeping `status`, `level`,
 * and `elapsedSeconds` in state and updating them from your capture logic, with
 * `onRecordStart` / `onRecordStop` fired by both hold-to-record and click-to-toggle
 * interactions. Use it to let users dictate input by voice, such as recording a message
 * before sending.
 *
 * @summary Push-to-talk voice recording button.
 */
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

  // Keyboard equivalent of the short-press/click flow: handlePointerDown/Up
  // only fire for pointer input, so Tab+Enter/Space would otherwise be
  // unable to start or stop a recording at all.
  async function handleKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>
  ): Promise<void> {
    buttonProps?.onKeyDown?.(event);
    if (event.defaultPrevented) {
      return;
    }

    if ((event.key !== "Enter" && event.key !== " ") || event.repeat) {
      return;
    }

    stopEvent(event);

    if (disabled) {
      return;
    }

    setMode("click");
    // The native click that follows this key press would otherwise re-run
    // handleClick's stop logic a second time.
    suppressNextClickRef.current = true;

    if (status === "idle") {
      await onRecordStart();
      markRecordingStarted();
      return;
    }

    if (status === "recording") {
      await onRecordStop();
    }
  }

  const icon = shouldShowStop ? Square : Microphone01;
  const variant = shouldShowStop || isLoading ? "highlight" : "ghost-secondary";
  const label = isTranscribing
    ? `${transcribingProgress ?? 0}%`
    : shouldShowStop && showStopLabel
      ? "Stop"
      : undefined;
  const tooltip = computeTooltip(interactionMode, isRecording, isTranscribing);

  return (
    <div className="flex items-center">
      <div
        className={cn(
          "flex items-center justify-end gap-2 overflow-hidden",
          compact ? "px-1" : "px-2",
          isRecording ? "opacity-100" : "hidden"
        )}
      >
        <div className="heading-xs font-mono">{formatTime(elapsedSeconds)}</div>
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
        onKeyDown={handleKeyDown}
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
    <div className="flex h-5 items-center gap-0.5">
      {heights.map((height, index) => (
        <div
          key={index}
          className="h-full w-0.5 origin-bottom rounded-full bg-muted-foreground transition-transform duration-150 ease-out motion-reduce:transition-none"
          style={{ transform: `scaleY(${Math.max(height, 20) / 100})` }}
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
    return "Transcribing…";
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
