import { cn } from "@sparkle/lib/utils";
import * as React from "react";

export type ProgressRingProps = Omit<
  React.SVGAttributes<SVGSVGElement>,
  "children"
> & {
  /**
   * Completion percentage (0-100). Out-of-range values are clamped.
   */
  percentage: number;
  /**
   * Diameter of the ring in pixels.
   */
  size?: number;
  /**
   * Stroke width of the ring, in the same unit as the viewBox.
   */
  strokeWidth?: number;
  /**
   * Accessible name announced by screen readers for the progressbar role.
   * Name what is progressing (e.g. "Seat usage").
   */
  label?: string;
};

/**
 * A small circular determinate progress indicator for a known completion
 * percentage. Exposes the `progressbar` role with value semantics; pass
 * `label` to name what is progressing for screen readers.
 *
 * The fill color follows `currentColor`, so pass a text color utility via
 * `className` (e.g. `text-warning-500`) to color it.
 *
 * For a linear indicator, use ProgressBar instead.
 *
 * @summary Determinate circular progress indicator (0-100%).
 */
export const ProgressRing = React.forwardRef<SVGSVGElement, ProgressRingProps>(
  (
    {
      percentage,
      size = 16,
      strokeWidth = 2,
      label = "Progress",
      className,
      ...props
    },
    ref
  ) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const clamped = Math.min(100, Math.max(0, percentage));
    const dashOffset = circumference * (1 - clamped / 100);
    const center = size / 2;
    return (
      <svg
        ref={ref}
        role="progressbar"
        aria-label={label}
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        {...props}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          stroke="currentColor"
          className="text-muted-background"
        />
        {clamped > 0 && (
          <circle
            cx={center}
            cy={center}
            r={radius}
            strokeWidth={strokeWidth}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className={cn(className)}
          />
        )}
      </svg>
    );
  }
);

ProgressRing.displayName = "ProgressRing";
