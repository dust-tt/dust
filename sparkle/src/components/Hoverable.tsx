import { cva, type VariantProps } from "class-variance-authority";
import React, { SyntheticEvent } from "react";
import { ReactNode } from "react";

import { cn } from "@sparkle/lib/utils";

const hoverableVariants = cva(
  "s-cursor-pointer s-duration-200 hover:s-underline hover:s-underline-offset-2",
  {
    variants: {
      variant: {
        invisible: "hover:s-text-highlight-light active:s-text-highlight-dark",
        primary:
          "s-font-medium s-text-foreground hover:s-text-highlight-light active:s-text-highlight-dark",
        highlight:
          "s-font-medium s-text-highlight hover:s-text-highlight-light active:s-text-highlight-dark",
      },
    },
    defaultVariants: {
      variant: "invisible",
    },
  }
);

interface HoverableProps extends VariantProps<typeof hoverableVariants> {
  children: ReactNode;
  className?: string;
  onClick: (e: SyntheticEvent) => void;
}

export function Hoverable({
  children,
  className,
  onClick,
  variant,
}: HoverableProps) {
  return (
    <span
      className={cn(hoverableVariants({ variant }), className)}
      onClick={onClick}
    >
      {children}
    </span>
  );
}
