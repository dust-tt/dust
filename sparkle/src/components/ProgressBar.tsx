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
  percentage: number;
}

export const ProgressBar = React.forwardRef<HTMLDivElement, ProgressBarProps>(
  ({ percentage, variant = "default", className, ...props }, ref) => {
    const clampedPercentage = Math.min(100, Math.max(0, percentage));

    return (
      <div
        ref={ref}
        role="progressbar"
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
