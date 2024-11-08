import { cva, VariantProps } from "class-variance-authority";
import { ReactNode } from "react";
import React from "react";

import { cn } from "@sparkle/lib/utils";

const animVariants = cva(
  "s-relative s-mx-auto s-max-w-md s-text-black/0 s-animate-shiny-text s-bg-clip-text s-bg-no-repeat [background-position:0_0] [background-size:50%_100%] s-bg-gradient-to-r",
  {
    variants: {
      variant: {
        muted:
          "s-from-transparent s-via-primary-950/80 s-via-50%  s-to-transparent",
        highlight:
          "s-from-highlight s-via-highlight-800 s-via-50% s-to-highlight",
      },
    },
    defaultVariants: {
      variant: "muted",
    },
  }
);

const textVariants = cva("s-absolute s-inset-0", {
  variants: {
    variant: {
      muted: "s-text-muted-foreground",
      highlight: "s-text-highlight",
    },
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
