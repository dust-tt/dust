import * as React from "react";

import { cn } from "@sparkle/lib/utils";

import type { ButtonVariantType } from "./Button";

export const COUNTER_SIZES = ["xs", "sm", "md"] as const;
type CounterSize = (typeof COUNTER_SIZES)[number];

export interface CounterProps {
  value: number;
  className?: string;
  size?: CounterSize;
  variant?: ButtonVariantType;
  isInButton?: boolean;
}

const sizeStyles: Record<CounterSize, string> = {
  xs: "s-h-5 s-min-w-[1.25rem] s-px-1 s-text-xs",
  sm: "s-h-6 s-min-w-[1.5rem] s-px-1.5 s-text-sm",
  md: "s-h-7 s-min-w-[1.75rem] s-px-2 s-text-base",
};

const buttonVariantStyles: Record<ButtonVariantType, string> = {
  primary: "s-bg-primary-600/40 s-text-white",
  highlight: "s-bg-highlight-dark/50 s-text-white",
  warning: "s-bg-warning-dark/50 s-text-white",
  outline: "s-bg-slate-100 s-text-slate-900",
  ghost: "s-text-primary-900 dark:s-text-primary-900-night",
  "ghost-secondary": "s-text-primary-900 dark:s-text-primary-900-night",
};

const standaloneVariantStyles: Record<ButtonVariantType, string> = {
  primary: "s-bg-primary-800 s-text-white",
  highlight: "s-bg-highlight s-text-white",
  warning: "s-bg-warning s-text-white",
  outline: "s-bg-slate-200 s-text-slate-900",
  ghost: "s-text-primary-950 dark:s-text-primary-950-night",
  "ghost-secondary": "s-text-primary-950 dark:s-text-primary-950-night",
};

export const Counter = React.forwardRef<HTMLDivElement, CounterProps>(
  (
    { value, className, size = "sm", variant = "primary", isInButton = false },
    ref
  ) => {
    const variantStyle = isInButton
      ? buttonVariantStyles[variant]
      : standaloneVariantStyles[variant];

    return (
      <div
        ref={ref}
        className={cn(
          "s-inline-flex s-items-center s-justify-center s-rounded-full s-font-medium",
          sizeStyles[size],
          variantStyle,
          className
        )}
      >
        {value}
      </div>
    );
  }
);

Counter.displayName = "Counter";
