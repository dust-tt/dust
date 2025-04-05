import { cva, VariantProps } from "class-variance-authority";
import React, { ReactNode } from "react";

import { cn } from "@sparkle/lib/utils";

const ANIMATED_TEXT_VARIANTS = [
  "primary",
  "muted",
  "white",
  "highlight",
  "success",
  "warning",
  "info",
  "green",
  "blue",
  "rose",
  "golden",
  //to be removed
  "emerald",
  "amber",
  "slate",
  "purple",
  "sky",
  "pink",
  "red",
] as const;

type AnimatedTextVariantType = (typeof ANIMATED_TEXT_VARIANTS)[number];

const animatedVariants: Record<AnimatedTextVariantType, string> = {
  primary: cn(
    "s-from-primary-800 s-via-primary-950 s-via-50% s-to-primary-800",
    "dark:s-from-primary-800-night dark:s-via-primary-950-night dark:s-via-50% dark:s-to-primary-800-night"
  ),
  muted: cn(
    "s-from-transparent s-via-primary-950/80 s-via-50% s-to-transparent",
    "dark:s-from-transparent dark:s-via-primary-50/80 dark:s-via-50% dark:s-to-transparent"
  ),
  white: cn(
    "s-from-primary-600 s-via-primary-950 s-via-50% s-to-primary-600",
    "dark:s-from-primary-600-night dark:s-via-primary-950-night dark:s-via-50% dark:s-to-primary-600-night"
  ),
  highlight: cn(
    "s-from-highlight s-via-highlight-800 s-via-50% s-to-highlight",
    "dark:s-from-highlight-night dark:s-via-highlight-800-night dark:s-via-50% dark:s-to-highlight-night"
  ),
  warning: cn(
    "s-from-warning-800 s-via-warning-950 s-via-50% s-to-warning-800",
    "dark:s-from-warning-800-night dark:s-via-warning-950-night dark:s-via-50% dark:s-to-warning-800-night"
  ),
  success: cn(
    "s-from-success-800 s-via-success-950 s-via-50% s-to-success-800",
    "dark:s-from-success-800-night dark:s-via-success-950-night dark:s-via-50% dark:s-to-success-800-night"
  ),
  info: cn(
    "s-from-info-800 s-via-info-950 s-via-50% s-to-info-800",
    "dark:s-from-info-800-night dark:s-via-info-950-night dark:s-via-50% dark:s-to-info-800-night"
  ),
  green: cn(
    "s-from-emerald-800 s-via-emerald-950 s-via-50% s-to-emerald-800",
    "dark:s-from-emerald-800-night dark:s-via-emerald-950-night dark:s-via-50% dark:s-to-emerald-800-night"
  ),
  blue: cn(
    "s-from-sky-800 s-via-sky-950 s-via-50% s-to-sky-800",
    "dark:s-from-sky-800-night dark:s-via-sky-950-night dark:s-via-50% dark:s-to-sky-800-night"
  ),
  rose: cn(
    "s-from-rose-800 s-via-rose-950 s-via-50% s-to-rose-800",
    "dark:s-from-rose-800-night dark:s-via-rose-950-night dark:s-via-50% dark:s-to-rose-800-night"
  ),
  golden: cn(
    "s-from-golden-800 s-via-golden-950 s-via-50% s-to-golden-800",
    "dark:s-from-golden-800-night dark:s-via-golden-950-night dark:s-via-50% dark:s-to-golden-800-night"
  ),
  // To be removed
  emerald: cn(
    "s-from-emerald-800 s-via-emerald-950 s-via-50% s-to-emerald-800",
    "dark:s-from-emerald-800-night dark:s-via-emerald-950-night dark:s-via-50% dark:s-to-emerald-800-night"
  ),
  amber: cn(
    "s-from-amber-800 s-via-amber-950 s-via-50% s-to-amber-800",
    "dark:s-from-amber-800-night dark:s-via-amber-950-night dark:s-via-50% dark:s-to-amber-800-night"
  ),
  red: cn(
    "s-from-red-800 s-via-red-950 s-via-50% s-to-red-800",
    "dark:s-from-red-800-night dark:s-via-red-950-night dark:s-via-50% dark:s-to-red-800-night"
  ),
  sky: cn(
    "s-from-sky-800 s-via-sky-950 s-via-50% s-to-sky-800",
    "dark:s-from-sky-800-night dark:s-via-sky-950-night dark:s-via-50% dark:s-to-sky-800-night"
  ),
  slate: cn(
    "s-from-primary-600 s-via-primary-950 s-via-50% s-to-primary-600",
    "dark:s-from-primary-600-night dark:s-via-primary-950-night dark:s-via-50% dark:s-to-primary-600-night"
  ),
  purple: cn(
    "s-from-purple-800 s-via-purple-950 s-via-50% s-to-purple-800",
    "dark:s-from-purple-800-night dark:s-via-purple-950-night dark:s-via-50% dark:s-to-purple-800-night"
  ),
  pink: cn(
    "s-from-pink-800 s-via-pink-950 s-via-50% s-to-pink-800",
    "dark:s-from-pink-800-night dark:s-via-pink-950-night dark:s-via-50% dark:s-to-pink-800-night"
  ),
};

const animVariants = cva(
  "s-relative s-mx-auto s-max-w-md s-text-black/0 s-animate-shiny-text s-bg-clip-text s-bg-no-repeat [background-position:0_0] [background-size:50%_100%] s-bg-gradient-to-r",
  {
    variants: {
      variant: animatedVariants,
    },
    defaultVariants: {
      variant: "muted",
    },
  }
);

const animatedTextVariants: Record<AnimatedTextVariantType, string> = {
  primary: "s-text-primary-800 dark:s-text-primary-800-night",
  white: "s-text-muted-foreground dark:s-text-muted-foreground-night",
  muted: "s-text-muted-foreground dark:s-text-muted-foreground-night",
  highlight: "s-text-highlight dark:s-text-highlight-night",
  success: "s-text-success-800 dark:s-text-success-800-night",
  info: "s-text-info-800 dark:s-text-info-800-night",
  warning: "s-text-warning-800 dark:s-text-warning-800-night",
  green: "s-text-emerald-800 dark:s-text-emerald-800-night",
  blue: "s-text-sky-800 dark:s-text-sky-800-night",
  rose: "s-text-rose-800 dark:s-text-rose-800-night",
  golden: "s-text-golden-800 dark:s-text-rose-golden-night",
  //To be removed
  emerald: "s-text-emerald-800 dark:s-text-emerald-800-night",
  amber: "s-text-amber-800 dark:s-text-amber-800-night",
  slate: "s-text-muted-foreground dark:s-text-muted-foreground-night",
  purple: "s-text-purple-800 dark:s-text-purple-800-night",
  sky: "s-text-sky-800 dark:s-text-sky-800-night",
  pink: "s-text-pink-800 dark:s-text-pink-800-night",
  red: "s-text-red-800 dark:s-text-red-800-night",
};

const textVariants = cva("s-absolute s-inset-0", {
  variants: {
    variant: animatedTextVariants,
  },
  defaultVariants: {
    variant: "muted",
  },
});

interface AnimatedShinyTextProps {
  children: ReactNode;
  variant?: VariantProps<typeof textVariants>["variant"];
  className?: string;
}

export function AnimatedText({
  children,
  variant,
  className,
}: AnimatedShinyTextProps) {
  return (
    <span className={cn("s-relative s-inline-block", className)}>
      <span className={textVariants({ variant })}>{children}</span>
      <span className={animVariants({ variant })}>{children}</span>
    </span>
  );
}
