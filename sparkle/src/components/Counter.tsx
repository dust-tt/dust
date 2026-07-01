import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

export const COUNTER_SIZES = ["xs", "sm", "md"] as const;

const counterVariants = cva(
  "inline-flex items-center justify-center rounded-full",
  {
    variants: {
      size: {
        xs: "h-4 min-w-[16px] px-0.5 text-xs",
        sm: "h-5 min-w-[20px] px-1 heading-xs",
        md: "h-6 min-w-[24px] px-1.5 heading-sm",
      },
      variant: {
        primary: "",
        highlight: "",
        "highlight-secondary": "",
        warning: "",
        "warning-secondary": "",
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
        className: "bg-primary text-primary-50",
      },
      {
        isInButton: false,
        variant: ["highlight", "highlight-secondary"],
        className: "bg-highlight text-white",
      },
      {
        isInButton: false,
        variant: ["warning", "warning-secondary"],
        className: "bg-warning text-white",
      },
      {
        isInButton: false,
        variant: "outline",
        className: "bg-primary-150 text-primary-900",
      },
      {
        isInButton: false,
        variant: ["ghost", "ghost-secondary"],
        className: "text-primary",
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
