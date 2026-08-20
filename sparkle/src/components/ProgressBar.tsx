import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const progressBarVariants = cva("h-1.5 overflow-hidden rounded-full", {
  variants: {
    variant: {
      default: "bg-muted-background",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

const progressBarFillVariants = cva("h-full rounded-full", {
  variants: {
    variant: {
      default: "bg-primary-light",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface ProgressBarProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children">,
    VariantProps<typeof progressBarVariants> {
  /** Progress value from 0 to 100; values outside the range are clamped. */
  percentage: number;
  /**
   * Accessible name announced by screen readers for the progressbar role.
   * Name what is progressing (e.g. "Upload progress").
   */
  label?: string;
}

/**
 * A slim determinate progress indicator for a known completion percentage.
 * Exposes the `progressbar` role with value semantics; pass `label` to name
 * what is progressing for screen readers.
 *
 * For indeterminate waits with no percentage, use Spinner instead.
 *
 * @summary Determinate progress indicator (0-100%).
 */
export const ProgressBar = React.forwardRef<HTMLDivElement, ProgressBarProps>(
  (
    {
      percentage,
      label = "Progress",
      variant = "default",
      className,
      ...props
    },
    ref
  ) => {
    const clampedPercentage = Math.min(100, Math.max(0, percentage));

    return (
      <div
        ref={ref}
        role="progressbar"
        aria-label={label}
        aria-valuenow={clampedPercentage}
        aria-valuemin={0}
        aria-valuemax={100}
        className={cn(progressBarVariants({ variant }), className)}
        {...props}
      >
        <div
          className={progressBarFillVariants({ variant })}
          style={{ width: `${clampedPercentage}%` }}
        />
      </div>
    );
  }
);

ProgressBar.displayName = "ProgressBar";
