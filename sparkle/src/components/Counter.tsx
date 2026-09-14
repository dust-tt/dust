import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

export const COUNTER_SIZES = ["xs", "sm", "md"] as const;

const pillShadow =
  "drop-shadow-[0px_1px_0.75px_rgba(0,0,0,0.08)] [text-shadow:0px_1px_1.5px_rgba(0,0,0,0.08)]";

const counterVariants = cva(
  "inline-flex items-center justify-center rounded-full",
  {
    variants: {
      // Fixed height == min-width keeps single digits circular; box-border
      // absorbs the outline variant's 1px border so it stays a circle.
      size: {
        xs: "h-5 min-w-5 px-1 heading-xs",
        sm: "h-6 min-w-6 px-1 heading-sm",
        md: "h-7 min-w-7 px-1.5 heading-base",
      },
      variant: {
        primary: "",
        highlight: "",
        "highlight-secondary": "",
        warning: "",
        "warning-secondary": "",
        info: "",
        outline: "",
        ghost: "",
        "ghost-secondary": "",
      },
      isInButton: {
        true: "",
        false: "",
      },
    },
    compoundVariants: [
      {
        isInButton: false,
        variant: "primary",
        className: cn(
          "bg-gradient-to-b from-primary-700 to-primary-950 text-primary-50",
          pillShadow
        ),
      },
      // Non-greyscale variants use the semantic colored tokens (aliases of the
      // blue/rose/golden palette), shared with Chip and dark-mode aware.
      {
        isInButton: false,
        variant: ["highlight", "highlight-secondary"],
        className: cn(
          "bg-gradient-to-b from-highlight-400 to-highlight-500 text-white",
          pillShadow
        ),
      },
      {
        isInButton: false,
        variant: ["warning", "warning-secondary"],
        className: cn(
          "bg-gradient-to-b from-warning-400 to-warning-500 text-white",
          pillShadow
        ),
      },
      {
        isInButton: false,
        variant: "info",
        className: cn(
          "bg-gradient-to-b from-info-400 to-info-500 text-white",
          pillShadow
        ),
      },
      {
        isInButton: false,
        variant: "outline",
        className: cn(
          "bg-gradient-to-b from-background to-muted-background border border-border text-muted-foreground",
          pillShadow
        ),
      },
      {
        isInButton: false,
        variant: ["ghost", "ghost-secondary"],
        className:
          "text-muted-foreground [text-shadow:0px_1px_1.5px_rgba(0,0,0,0.08)]",
      },
      {
        isInButton: true,
        variant: "primary",
        className: "bg-primary-600 text-primary-50",
      },
      {
        isInButton: true,
        variant: ["highlight", "highlight-secondary"],
        className: "bg-highlight-400 text-white",
      },
      {
        isInButton: true,
        variant: ["warning", "warning-secondary"],
        className: "bg-warning-400 text-white",
      },
      {
        isInButton: true,
        variant: "info",
        className: "bg-info-400 text-white",
      },
      {
        isInButton: true,
        variant: "outline",
        className: "bg-primary-150 text-primary-700",
      },
      {
        isInButton: true,
        variant: ["ghost", "ghost-secondary"],
        className: "bg-primary-150 text-primary-700",
      },
    ],
    defaultVariants: {
      size: "sm",
      variant: "primary",
      isInButton: false,
    },
  }
);

export interface CounterProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof counterVariants> {
  /** The count to display. Cap large values for legibility (e.g. show "99+"). */
  value: number;
}

/**
 * A small numeric badge that communicates a count — unread items, pending
 * actions, or results — in several sizes and variants. Use it to show a count
 * attached to an item, tab, or button (via isInButton); use it for counts,
 * not arbitrary text.
 * @summary Numeric count badge.
 */
export const Counter = React.forwardRef<HTMLDivElement, CounterProps>(
  (
    {
      value,
      className,
      size = "sm",
      variant = "primary",
      isInButton = false,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          counterVariants({ size, variant, isInButton }),
          className
        )}
        {...props}
      >
        {value}
      </div>
    );
  }
);

Counter.displayName = "Counter";
