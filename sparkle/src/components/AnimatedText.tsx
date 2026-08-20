import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import React, { type ReactNode } from "react";

const ANIMATED_TEXT_VARIANTS = [
  "primary",
  "muted",
  "highlight",
  "success",
  "warning",
  "info",
  "green",
  "blue",
  "rose",
  "golden",
  "white",
] as const;

type AnimatedTextVariantType = (typeof ANIMATED_TEXT_VARIANTS)[number];

const animatedVariants: Record<AnimatedTextVariantType, string> = {
  primary: cn("from-primary-600 via-primary-950 via-50% to-primary-600"),
  muted: cn("from-transparent via-primary-950/80 via-50% to-transparent"),
  highlight: cn("from-highlight via-highlight-800 via-50% to-highlight"),
  warning: cn("from-warning-800 via-warning-950 via-50% to-warning-800"),
  success: cn("from-success-800 via-success-950 via-50% to-success-800"),
  info: cn("from-info-800 via-info-950 via-50% to-info-800"),
  green: cn("from-emerald-800 via-emerald-950 via-50% to-emerald-800"),
  blue: cn("from-sky-800 via-sky-950 via-50% to-sky-800"),
  rose: cn("from-warning-800 via-warning-950 via-50% to-warning-800"),
  golden: cn("from-info-800 via-info-950 via-50% to-info-800"),
  white: cn("from-primary-800 via-primary-950 via-50% to-primary-800"),
};

const animVariants = cva(
  "relative mx-auto max-w-md text-black/0 animate-shiny-text bg-clip-text bg-no-repeat [background-position:0_0] [background-size:50%_100%] bg-linear-to-r",
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
  primary: "text-primary-800",
  muted: "text-muted-foreground",
  highlight: "text-highlight",
  success: "text-success-800",
  info: "text-info-800",
  warning: "text-warning-800",
  green: "text-emerald-800",
  blue: "text-sky-800",
  rose: "text-warning-800",
  golden: "text-info-800",
  white: "text-primary-800",
};

const textVariants = cva("absolute inset-0", {
  variants: {
    variant: animatedTextVariants,
  },
  defaultVariants: {
    variant: "muted",
  },
});

interface AnimatedShinyTextProps {
  children: ReactNode;
  /** Tints the shimmer to a semantic or brand color (default `muted`). */
  variant?: VariantProps<typeof textVariants>["variant"];
  className?: string;
}

/**
 * Text with a shimmering gradient sweeping across the characters, signalling that
 * something is in progress (e.g. a "Thinking..." indicator). Use it for ephemeral
 * "agent is working" states with no measurable progress; for a generic, non-text
 * loading indicator, use Spinner instead.
 * @summary Shimmering in-progress text.
 */
export function AnimatedText({
  children,
  variant,
  className,
}: AnimatedShinyTextProps) {
  return (
    <span className={cn("relative inline-block", className)}>
      <span className={textVariants({ variant })}>{children}</span>
      <span className={animVariants({ variant })}>{children}</span>
    </span>
  );
}
