import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@sparkle/lib/utils";

export const COUNTER_SIZES = ["xs", "sm", "md"] as const;

const counterVariants = cva(
  "s-inline-flex s-items-center s-justify-center s-rounded-full s-font-medium",
  {
    variants: {
      size: {
        xs: "s-h-5 s-min-w-[1.25rem] s-px-1 s-text-xs",
        sm: "s-h-6 s-min-w-[1.5rem] s-px-1.5 s-text-sm",
        md: "s-h-7 s-min-w-[1.75rem] s-px-2 s-text-base",
      },
      variant: {
        primary: "",
        highlight: "",
        warning: "",
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
        isInButton: true,
        variant: "primary",
        className: "s-bg-primary-600/40 s-text-white",
      },
      {
        isInButton: true,
        variant: "highlight",
        className: "s-bg-highlight-dark/50 s-text-white",
      },
      {
        isInButton: true,
        variant: "warning",
        className: "s-bg-warning-dark/50 s-text-white",
      },
      {
        isInButton: true,
        variant: "outline",
        className: "s-bg-slate-100 s-text-slate-900",
      },
      {
        isInButton: true,
        variant: ["ghost", "ghost-secondary"],
        className: "s-text-primary-900 dark:s-text-primary-900-night",
      },
      {
        isInButton: false,
        variant: "primary",
        className: "s-bg-primary-800 s-text-white",
      },
      {
        isInButton: false,
        variant: "highlight",
        className: "s-bg-highlight s-text-white",
      },
      {
        isInButton: false,
        variant: "warning",
        className: "s-bg-warning s-text-white",
      },
      {
        isInButton: false,
        variant: "outline",
        className: "s-bg-slate-200 s-text-slate-900",
      },
      {
        isInButton: false,
        variant: ["ghost", "ghost-secondary"],
        className: "s-text-primary-950 dark:s-text-primary-950-night",
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
  value: number;
}

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
