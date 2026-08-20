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

export type ProgressBarProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "children"
> &
  VariantProps<typeof progressBarVariants> & {
    /**
     * Accessible name announced by screen readers for the progressbar role.
     * Name what is progressing (e.g. "Upload progress").
     */
    label?: string;
  } & (
    | { percentage: number; values?: never }
    | {
        percentage?: never;
        values: Array<{ value: number; className?: string }>;
      }
  );

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
      values,
      label = "Progress",
      radius = "full",
      variant = "default",
      className,
      ...props
    },
    ref
  ) => {
    const isSegmented = values !== undefined;
    const nonNegativeValues =
      values?.map((item) => ({
        ...item,
        value: Math.max(0, item.value),
      })) ?? [];
    const totalValue = nonNegativeValues.reduce(
      (total, item) => total + item.value,
      0
    );
    const normalizedValues = isSegmented
      ? nonNegativeValues.map((item) => ({
          percentage: totalValue > 0 ? (item.value / totalValue) * 100 : 0,
          className: item.className,
        }))
      : [
          {
            percentage: Math.min(100, Math.max(0, percentage ?? 0)),
            className: undefined,
          },
        ];
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-label={label}
        aria-valuenow={normalizedValues[0]?.percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        className={cn(
          progressBarVariants({ radius, variant }),
          isSegmented && "flex gap-0.5",
          className
        )}
        {...props}
      >
        {normalizedValues.map((segment, index) =>
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
