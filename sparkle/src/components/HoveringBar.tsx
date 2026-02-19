import { ScrollArea } from "@sparkle/components/ScrollArea";
import { Separator } from "@sparkle/components/Separator";
import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const hoveringBarVariants = cva(
  cn(
    "s-inline-flex s-items-center s-shadow-md s-backdrop-blur-sm s-p-1",
    "s-bg-background/80 s-border s-border-border dark:border-border-night dark:bg-background-night/80"
  ),
  {
    variants: {
      size: {
        xs: "s-rounded-xl",
        sm: "s-rounded-2xl",
      },
    },
    defaultVariants: {
      size: "xs",
    },
  }
);

export interface HoveringBarProps
  extends VariantProps<typeof hoveringBarVariants> {
  children: React.ReactNode;
  className?: string;
}

export function HoveringBar({ children, className, size }: HoveringBarProps) {
  return (
    <div className={cn(hoveringBarVariants({ size }), className)}>
      <ScrollArea orientation="horizontal" hideScrollBar className="s-h-full">
        <div className="s-flex s-items-center s-gap-1">{children}</div>
      </ScrollArea>
    </div>
  );
}

function HoveringBarSeparator() {
  return <Separator orientation="vertical" className="s-my-1" />;
}

HoveringBar.Separator = HoveringBarSeparator;
