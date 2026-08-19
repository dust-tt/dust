import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const progressBarVariants = cva("h-1.5 overflow-hidden", {
  variants: {
    radius: {
      none: "rounded-none",
      xs: "rounded-xs",
      full: "rounded-full",
    },
    variant: {
      default: "bg-muted-background",
    },
  },
  defaultVariants: {
    radius: "full",
    variant: "default",
  },
});

const progressBarFillVariants = cva("h-full", {
  variants: {
    radius: {
      none: "rounded-none",
      xs: "rounded-xs",
      full: "rounded-full",
    },
    variant: {
      default: "bg-primary-light",
    },
  },
  defaultVariants: {
    radius: "full",
    variant: "default",
  },
});

interface ProgressBarSegment {
  percentage: number;
  className?: string;
}

export type ProgressBarProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "children"
> &
  VariantProps<typeof progressBarVariants> &
  (
    | { percentage: number; segments?: never }
    | { percentage?: never; segments: ProgressBarSegment[] }
  );

export const ProgressBar = React.forwardRef<HTMLDivElement, ProgressBarProps>(
  (
    {
      percentage,
      segments,
      radius = "full",
      variant = "default",
      className,
      ...props
    },
    ref
  ) => {
    const isSegmented = segments !== undefined;
    const values: ProgressBarSegment[] =
      segments ?? (percentage === undefined ? [] : [{ percentage }]);
    const clampedSegments = values.map((segment) => ({
      ...segment,
      percentage: Math.min(100, Math.max(0, segment.percentage)),
    }));
    const valueNow = isSegmented
      ? Math.min(
          100,
          clampedSegments.reduce(
            (total, segment) => total + segment.percentage,
            0
          )
        )
      : clampedSegments[0]?.percentage;

    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuenow={valueNow}
        aria-valuemin={0}
        aria-valuemax={100}
        className={cn(
          progressBarVariants({ radius, variant }),
          isSegmented && "flex gap-0.5",
          className
        )}
        {...props}
      >
        {clampedSegments.map((segment, index) =>
          !isSegmented || segment.percentage > 0 ? (
            <div
              key={index}
              className={cn(
                progressBarFillVariants({ radius, variant }),
                segment.className
              )}
              style={
                isSegmented
                  ? { flexBasis: 0, flexGrow: segment.percentage }
                  : { width: `${segment.percentage}%` }
              }
            />
          ) : null
        )}
      </div>
    );
  }
);

ProgressBar.displayName = "ProgressBar";
