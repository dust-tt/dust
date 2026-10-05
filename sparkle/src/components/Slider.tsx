import * as SliderPrimitive from "@radix-ui/react-slider";
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "@sparkle/components/Tooltip";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React from "react";

export const SLIDER_VARIANTS = ["primary", "highlight"] as const;

export type SliderVariantType = (typeof SLIDER_VARIANTS)[number];

// Thumb and fill glide together to a clicked position: same easing and
// duration so they read as one unit. `inset` covers the left/right (or
// top/bottom) offsets Radix writes inline.
const MOVE_TRANSITION =
  "transition-[inset] duration-200 ease-in-out motion-reduce:transition-none";

// The knob's focus ring takes the fill color of the same variant. The border
// is dropped while the knob is dragged (`data-dragging` on the thumb).
const sliderKnobVariants = cva(
  cn(
    "block h-4 w-4 rounded-full border border-border-dark bg-white drop-shadow",
    "group-data-[dragging]/thumb:border-transparent",
    "group-focus-visible/thumb:ring-2 group-focus-visible/thumb:ring-offset-2 group-focus-visible/thumb:ring-offset-background"
  ),
  {
    variants: {
      variant: {
        primary: "group-focus-visible/thumb:ring-primary",
        highlight: "group-focus-visible/thumb:ring-highlight",
      },
    },
    defaultVariants: {
      variant: "primary",
    },
  }
);

// Fill colors follow the Button variants of the same name.
const sliderRangeVariants = cva(
  cn(
    "absolute rounded-full",
    "data-[orientation=horizontal]:h-full",
    "data-[orientation=vertical]:w-full"
  ),
  {
    variants: {
      variant: {
        primary: "bg-primary",
        highlight: "bg-highlight",
      },
    },
    defaultVariants: {
      variant: "primary",
    },
  }
);

function snapToStep(
  raw: number,
  min: number,
  max: number,
  step: number
): number {
  const snapped = min + Math.round((raw - min) / step) * step;
  // Round away float noise (e.g. 0.1 + 0.2) at the step's precision.
  const decimals = (String(step).split(".")[1] ?? "").length;
  return Math.min(max, Math.max(min, Number(snapped.toFixed(decimals))));
}

function pointerRatio(
  e: React.PointerEvent,
  rect: DOMRect,
  { isVertical, inverted }: { isVertical: boolean; inverted: boolean }
): number {
  const size = isVertical ? rect.height : rect.width;
  if (size === 0) {
    return 0;
  }
  // Radix maps the track bottom-to-top for vertical sliders.
  const raw = isVertical
    ? (rect.bottom - e.clientY) / size
    : (e.clientX - rect.left) / size;
  const clamped = Math.min(Math.max(raw, 0), 1);
  return inverted ? 1 - clamped : clamped;
}

export type SliderProps = React.ComponentPropsWithoutRef<
  typeof SliderPrimitive.Root
> & {
  /** Color of the filled part of the track: `primary` (default) or `highlight` (blue), like the Button variants. */
  variant?: SliderVariantType;
  /**
   * Accessible name applied to every thumb. Use `thumbAriaLabels` instead to
   * name each thumb of a range slider individually.
   */
  ariaLabel?: string;
  /** Per-thumb accessible names, by thumb index; wins over `ariaLabel`. */
  thumbAriaLabels?: string[];
  /**
   * Shows a tooltip above the pointer while it is over the slider: the value a
   * click there would select, or the dragged thumb's value during a drag.
   */
  showValueTooltip?: boolean;
  /** Formats the value shown in the tooltip; defaults to the raw number. */
  formatValue?: (value: number) => React.ReactNode;
};

/**
 * A continuous slider for picking a number (one thumb) or a range (two or more
 * thumbs) between `min` and `max`, snapping to `step`. Ported from shadcn's
 * slider onto Radix, so it accepts the Radix Slider root props: `value` /
 * `defaultValue`, `onValueChange`, `onValueCommit`, `orientation`, `disabled`,
 * `inverted`, `minStepsBetweenThumbs`, `name` and `form`.
 *
 * For a small ordered scale with labelled positions (e.g. reasoning effort),
 * prefer `SliderSteps`; for an on/off setting, prefer `SliderToggle`.
 *
 * @summary Continuous value or range slider.
 */
/**
 * @cc [owner:ClementAupiais,label:react] thumb-count-follows-values
 * The number of rendered thumbs MUST equal the length of `value` when it is an
 * array, otherwise the length of `defaultValue` when it is an array, otherwise 1.
 * A range slider (two or more values) MUST therefore render one thumb per value
 * and never a single thumb.
 */
/**
 * @cc [owner:ClementAupiais,label:react] value-tooltip-follows-pointer
 * When `showValueTooltip` is set and the slider is enabled, the value tooltip
 * MUST be open while the pointer is over the slider or a drag is in progress,
 * and closed otherwise. While hovering it MUST show the value a click at the
 * pointer position would select (snapped to `step`, honoring `orientation`
 * and `inverted`); while dragging it MUST show the dragged thumb's current
 * value.
 */
export const Slider = React.forwardRef<
  React.ComponentRef<typeof SliderPrimitive.Root>,
  SliderProps
>(
  (
    {
      className,
      defaultValue,
      value,
      min = 0,
      max = 100,
      step = 1,
      orientation = "horizontal",
      inverted = false,
      disabled,
      variant = "primary",
      ariaLabel,
      thumbAriaLabels,
      showValueTooltip = false,
      formatValue = (v) => v,
      onValueChange,
      onPointerDown,
      onPointerMove,
      onPointerLeave,
      onKeyDown,
      onPointerUp,
      onPointerCancel,
      ...props
    },
    ref
  ) => {
    // Mirror the values so the tooltip can read them in uncontrolled usage.
    const [internalValues, setInternalValues] = React.useState<number[]>(
      value ?? defaultValue ?? [min]
    );
    const values = value ?? internalValues;

    // Radix focuses the thumb under the pointer on pointer down, so the
    // focused index identifies the dragged thumb.
    const [isDragging, setIsDragging] = React.useState(false);
    const [focusedIndex, setFocusedIndex] = React.useState<number | null>(null);
    // Last pointer position along the track as a 0..1 ratio in value
    // direction. Kept after the pointer leaves so the tooltip's exit
    // animation plays in place instead of sliding to a reset anchor.
    const [cursorRatio, setCursorRatio] = React.useState(0);
    const [isHovering, setIsHovering] = React.useState(false);
    // A click on the track jumps the thumb, and the jump is animated. Drags
    // and keyboard steps must track the input instantly, so the transition is
    // turned off on the first pointer move and on any key press, in the same
    // render as the value change they trigger.
    const [isAnimated, setIsAnimated] = React.useState(false);

    const isVertical = orientation === "vertical";

    const thumbCount = Array.isArray(value)
      ? value.length
      : Array.isArray(defaultValue)
        ? defaultValue.length
        : 1;

    const draggedValue =
      isDragging && focusedIndex !== null ? values[focusedIndex] : undefined;
    const tooltipValue =
      draggedValue ??
      snapToStep(min + cursorRatio * (max - min), min, max, step);
    const isTooltipOpen =
      showValueTooltip && !disabled && (isDragging || isHovering);
    // Ratio measured from the start edge, where Radix's start edge is left
    // for horizontal and bottom for vertical, flipped back when inverted.
    const anchorRatio = inverted ? 1 - cursorRatio : cursorRatio;

    const root = (
      <SliderPrimitive.Root
        ref={ref}
        className={cn(
          "relative flex touch-none select-none items-center",
          "data-[orientation=horizontal]:w-full",
          "data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-40 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
          "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
          // Radix positions each thumb through an unstyled wrapper span, so
          // the thumb's move transition is set from the root.
          isAnimated &&
            "[&>span:has(>[role=slider])]:transition-[inset] [&>span:has(>[role=slider])]:duration-200 [&>span:has(>[role=slider])]:ease-in-out motion-reduce:[&>span:has(>[role=slider])]:transition-none",
          className
        )}
        defaultValue={defaultValue}
        value={value}
        min={min}
        max={max}
        step={step}
        orientation={orientation}
        inverted={inverted}
        disabled={disabled}
        onValueChange={(next) => {
          setInternalValues(next);
          onValueChange?.(next);
        }}
        onPointerDown={(e) => {
          setIsDragging(true);
          setIsAnimated(true);
          onPointerDown?.(e);
        }}
        onPointerMove={(e) => {
          if (isDragging) {
            setIsAnimated(false);
          }
          if (showValueTooltip) {
            setIsHovering(true);
            setCursorRatio(
              pointerRatio(e, e.currentTarget.getBoundingClientRect(), {
                isVertical,
                inverted,
              })
            );
          }
          onPointerMove?.(e);
        }}
        onPointerLeave={(e) => {
          setIsHovering(false);
          onPointerLeave?.(e);
        }}
        onKeyDown={(e) => {
          setIsAnimated(false);
          onKeyDown?.(e);
        }}
        onPointerUp={(e) => {
          setIsDragging(false);
          onPointerUp?.(e);
        }}
        onPointerCancel={(e) => {
          setIsDragging(false);
          onPointerCancel?.(e);
        }}
        {...props}
      >
        <SliderPrimitive.Track
          className={cn(
            "relative grow overflow-hidden rounded-full bg-muted-background",
            "data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full",
            "data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5"
          )}
        >
          <SliderPrimitive.Range
            className={cn(
              sliderRangeVariants({ variant }),
              isAnimated && MOVE_TRANSITION
            )}
          />
        </SliderPrimitive.Track>
        {Array.from({ length: thumbCount }, (_, index) => (
          <SliderPrimitive.Thumb
            key={index}
            aria-label={thumbAriaLabels?.[index] ?? ariaLabel}
            data-dragging={
              isDragging && focusedIndex === index ? "" : undefined
            }
            onFocus={() => setFocusedIndex(index)}
            className={cn(
              "group/thumb flex h-5 w-5 shrink-0 items-center justify-center rounded-full focus-visible:outline-hidden",
              "data-[disabled]:pointer-events-none"
            )}
          >
            {/* Same knob as SliderToggle and SliderSteps: a white ball with a
                drop shadow, centered in a 20px hit area. The focus ring is
                drawn on the ball itself so it hugs the visible knob. */}
            <span className={sliderKnobVariants({ variant })} />
          </SliderPrimitive.Thumb>
        ))}
        {showValueTooltip && (
          <TooltipRoot open={isTooltipOpen}>
            {/* Invisible anchor under the pointer so the tooltip follows it. */}
            <TooltipTrigger asChild>
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute",
                  isVertical ? "left-0 h-0 w-full" : "top-0 h-full w-0"
                )}
                style={
                  isVertical
                    ? { top: `${(1 - anchorRatio) * 100}%` }
                    : { left: `${anchorRatio * 100}%` }
                }
              />
            </TooltipTrigger>
            <TooltipContent
              side={isVertical ? "right" : "top"}
              updatePositionStrategy="always"
            >
              {formatValue(tooltipValue)}
            </TooltipContent>
          </TooltipRoot>
        )}
      </SliderPrimitive.Root>
    );

    if (!showValueTooltip) {
      return root;
    }

    return <TooltipProvider delayDuration={0}>{root}</TooltipProvider>;
  }
);

Slider.displayName = "Slider";
