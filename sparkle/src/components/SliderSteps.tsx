import * as SliderPrimitive from "@radix-ui/react-slider";
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "@sparkle/components/Tooltip";
import { Lock01, SlashCircle01 } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import React from "react";

// Radix keeps the thumb inside the track bounds by shifting it by up to half
// its width at the extremities. Step markers and the hover preview must apply
// the same shift to land exactly where the thumb does, so
// this must match the measured size of the Thumb element exactly.
// The thumb spans the full track height; the visible ball is drawn 4px
// smaller inside it, so the fill (which extends half a thumb past the thumb
// center) wraps the ball with a constant-radius endcap and a 2px ring.
const THUMB_SIZE_PX = 20;

function stepCenter(index: number, lastIndex: number): string {
  const ratio = lastIndex > 0 ? index / lastIndex : 0;
  const offsetPx = (0.5 - ratio) * THUMB_SIZE_PX;
  return `calc(${ratio * 100}% + ${offsetPx}px)`;
}

export interface SliderStepsProps {
  /** Total number of selectable positions on the track. */
  stepCount: number;
  /** Currently selected step, as a 0-based index. */
  value: number;
  /** Called with the 0-based index of the step the selection snapped to. */
  onChange: (index: number) => void;
  /** 0-based indices rendered with a padlock and skipped when snapping. */
  lockedSteps?: number[];
  /** 0-based indices rendered with a slash and skipped when snapping. */
  unavailableSteps?: number[];
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  /** Per-step tooltip content, shown for the step under the pointer (unselectable steps included). */
  stepTooltips?: React.ReactNode[];
}

/**
 * A stepped slider for choosing one of a few ordered levels, from the same family as
 * `SliderToggle` (same track, fill and knob). Dots mark the available positions, hovering
 * past the knob previews the fill up to the step it would snap to. Locked steps use a
 * padlock; unavailable steps use a slash. Both are skipped when snapping. Use it for a
 * setting with a small ordered scale that applies immediately (e.g. reasoning effort
 * levels), rendering your own labels beneath it; for a binary setting, prefer
 * `SliderToggle`.
 *
 * @summary Stepped slider for ordered levels.
 */
export function SliderSteps({
  stepCount,
  value,
  onChange,
  lockedSteps,
  unavailableSteps,
  disabled = false,
  className,
  ariaLabel,
  stepTooltips,
}: SliderStepsProps) {
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);

  const lastIndex = Math.max(stepCount - 1, 1);
  const lockedSet = new Set(lockedSteps);
  const unavailableSet = new Set(unavailableSteps);
  const isSelectable = (index: number) =>
    !lockedSet.has(index) && !unavailableSet.has(index);

  const nearestSelectable = (target: number): number | null => {
    for (let distance = 0; distance < stepCount; distance++) {
      const below = target - distance;
      const above = target + distance;
      if (below >= 0 && isSelectable(below)) {
        return below;
      }
      if (above < stepCount && isSelectable(above)) {
        return above;
      }
    }
    return null;
  };

  const handleValueChange = ([raw]: number[]) => {
    const next = nearestSelectable(raw);
    if (next !== null && next !== value) {
      onChange(next);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) {
      return;
    }
    const ratio = Math.min(
      Math.max((e.clientX - rect.left) / rect.width, 0),
      1
    );
    // Track the raw step under the pointer so an unselectable step surfaces its
    // own tooltip. Selection and preview snap separately.
    setHoveredIndex(Math.round(ratio * lastIndex));
  };

  // Where selecting would land: the nearest selectable step to the raw hover.
  const snappedHoverIndex =
    hoveredIndex !== null ? nearestSelectable(hoveredIndex) : null;

  // Decided at render time so the preview vanishes as soon as the hovered step
  // becomes the value (click/drag), without waiting for the next pointer move.
  const previewIndex =
    !disabled && snappedHoverIndex !== null && snappedHoverIndex > value
      ? snappedHoverIndex
      : null;

  // The tooltip reflects the raw hovered step, not where selection would snap.
  const activeTooltip =
    hoveredIndex !== null ? (stepTooltips?.[hoveredIndex] ?? null) : null;

  const slider = (
    <SliderPrimitive.Root
      className={cn(
        "relative flex h-5 w-full touch-none select-none items-center",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className
      )}
      min={0}
      max={lastIndex}
      step={1}
      value={[value]}
      onValueChange={handleValueChange}
      disabled={disabled}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHoveredIndex(null)}
    >
      <SliderPrimitive.Track className="relative h-full w-full grow rounded-full bg-slider-toggle-bg-idle">
        {/* Dots on the selectable positions, painted under the fill. */}
        {Array.from({ length: stepCount }, (_, index) =>
          isSelectable(index) ? (
            <span
              key={index}
              className="absolute top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-400"
              style={{ left: stepCenter(index, lastIndex) }}
            />
          ) : null
        )}
        {/* Fill up to the knob. Drawn by hand instead of Radix's Range: Range
            stops at the raw value percent while the thumb is shifted inward to
            stay in bounds, which would leave a gap between fill and knob. */}
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-highlight-400"
          style={{
            width: `calc(${stepCenter(value, lastIndex)} + ${THUMB_SIZE_PX / 2}px)`,
          }}
        />
        {/* Hover preview: the fill's would-be extent, in SliderToggle's hover
            tint. Width animates so reaching for the next step feels guided. */}
        <span
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 rounded-full",
            "bg-black/6 dark:bg-white/8",
            "transition-[width,opacity] duration-200 ease-in-out motion-reduce:transition-none",
            previewIndex !== null ? "opacity-100" : "opacity-0"
          )}
          style={{
            width:
              previewIndex !== null
                ? `calc(${stepCenter(previewIndex, lastIndex)} + ${THUMB_SIZE_PX / 2}px)`
                : 0,
          }}
        />
        {/* Access locks and unavailable markers sit at their step positions. */}
        {Array.from({ length: stepCount }, (_, index) => {
          const StepMarker = lockedSet.has(index)
            ? Lock01
            : unavailableSet.has(index)
              ? SlashCircle01
              : null;

          return StepMarker ? (
            <span
              key={index}
              className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-white"
              style={{ left: stepCenter(index, lastIndex) }}
            >
              <StepMarker aria-hidden className="h-3 w-3" />
            </span>
          ) : null;
        })}
        {/* SliderToggle's inset shadow, as a topmost transparent overlay so it
            reads over the fill too (the fill would otherwise paint above a
            shadow set on the track itself). */}
        <span className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0px_-3px_3px_0px_rgba(255,255,255,0.25),inset_0px_0.5px_2px_0px_rgba(0,0,0,0.14)]" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={ariaLabel}
        className="flex h-5 w-5 items-center justify-center focus:outline-none"
      >
        <span className="block h-4 w-4 rounded-full bg-white drop-shadow" />
      </SliderPrimitive.Thumb>
    </SliderPrimitive.Root>
  );

  if (!stepTooltips) {
    return slider;
  }

  return (
    <TooltipProvider delayDuration={0}>
      <TooltipRoot open={activeTooltip !== null}>
        {/* Keep the trigger geometry stable while the hovered step changes. */}
        <TooltipTrigger asChild>{slider}</TooltipTrigger>
        {activeTooltip !== null ? (
          <TooltipContent>{activeTooltip}</TooltipContent>
        ) : null}
      </TooltipRoot>
    </TooltipProvider>
  );
}
