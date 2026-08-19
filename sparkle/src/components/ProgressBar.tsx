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

interface ProgressBarBaseProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children">,
    VariantProps<typeof progressBarVariants> {
  fillClassName?: string | string[];
}

export type ProgressBarProps = ProgressBarBaseProps &
  (
    | { percentage: number; percentages?: never }
    | { percentage?: never; percentages: number[] }
  );

export const ProgressBar = React.forwardRef<HTMLDivElement, ProgressBarProps>(
  (
    {
      percentage,
      percentages,
      radius = "full",
      variant = "default",
      className,
      fillClassName,
      ...props
    },
    ref
  ) => {
    const isSegmented = percentages !== undefined;
    const values =
      percentages ?? (percentage === undefined ? [] : [percentage]);
    const clampedPercentages = values.map((value) =>
      Math.min(100, Math.max(0, value))
    );
    const valueNow = isSegmented
      ? Math.min(
          100,
          clampedPercentages.reduce((total, value) => total + value, 0)
        )
      : clampedPercentages[0];

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
        {clampedPercentages.map((value, index) =>
          !isSegmented || value > 0 ? (
            <div
              key={index}
              className={cn(
                progressBarFillVariants({ radius, variant }),
                Array.isArray(fillClassName)
                  ? fillClassName[index]
                  : fillClassName
              )}
              style={
                isSegmented
                  ? { flexBasis: 0, flexGrow: value }
                  : { width: `${value}%` }
              }
            />
          ) : null
        )}
      </div>
    );
  }
);

ProgressBar.displayName = "ProgressBar";
