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
  primary: cn(
    "s:from-primary-600 s:via-primary-950 s:via-50% s:to-primary-600"
  ),
  muted: cn(
    "s:from-transparent s:via-primary-950/80 s:via-50% s:to-transparent"
  ),
  highlight: cn(
    "s:from-highlight s:via-highlight-800 s:via-50% s:to-highlight"
  ),
  warning: cn(
    "s:from-warning-800 s:via-warning-950 s:via-50% s:to-warning-800"
  ),
  success: cn(
    "s:from-success-800 s:via-success-950 s:via-50% s:to-success-800"
  ),
  info: cn("s:from-info-800 s:via-info-950 s:via-50% s:to-info-800"),
  green: cn("s:from-emerald-800 s:via-emerald-950 s:via-50% s:to-emerald-800"),
  blue: cn("s:from-sky-800 s:via-sky-950 s:via-50% s:to-sky-800"),
  rose: cn("s:from-rose-800 s:via-rose-950 s:via-50% s:to-rose-800"),
  golden: cn("s:from-golden-800 s:via-golden-950 s:via-50% s:to-golden-800"),
  white: cn("s:from-primary-800 s:via-primary-950 s:via-50% s:to-primary-800"),
};

const animVariants = cva(
  "s:relative s:mx-auto s:max-w-md s:text-black/0 s:animate-shiny-text s:bg-clip-text s:bg-no-repeat [background-position:0_0] [background-size:50%_100%] s:bg-gradient-to-r",
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
  primary: "s:text-primary-800",
  muted: "s:text-muted-foreground",
  highlight: "s:text-highlight",
  success: "s:text-success-800",
  info: "s:text-info-800",
  warning: "s:text-warning-800",
  green: "s:text-emerald-800",
  blue: "s:text-sky-800",
  rose: "s:text-rose-800",
  golden: "s:text-golden-800",
  white: "s:text-primary-800",
};

const textVariants = cva("s:absolute s:inset-0", {
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
    <span className={cn("s:relative s:inline-block", className)}>
      <span className={textVariants({ variant })}>{children}</span>
      <span className={animVariants({ variant })}>{children}</span>
    </span>
  );
}
