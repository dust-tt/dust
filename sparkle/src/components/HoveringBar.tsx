import { ScrollArea } from "@sparkle/components/ScrollArea";
import { Separator } from "@sparkle/components/Separator";
import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const hoveringBarVariants = cva(
  cn(
    "inline-flex items-center shadow-md backdrop-blur-sm p-1",
    "bg-background/80 border border-border"
  ),
  {
    variants: {
      size: {
        xs: "rounded-xl",
        sm: "rounded-2xl",
      },
    },
    defaultVariants: {
      size: "xs",
    },
  }
);

export interface HoveringBarProps
  extends VariantProps<typeof hoveringBarVariants> {
  /** Actions to display, typically icon Buttons; use HoveringBar.Separator to group them. */
  children: React.ReactNode;
  className?: string;
}

/**
 * A compact floating toolbar that groups contextual actions, typically surfaced
 * over a selection or hovered element (e.g. a rich-text formatting bar). Compose
 * it from Button children and insert HoveringBar.Separator to visually group
 * related actions. Use it for inline, contextual action clusters such as
 * text-formatting controls or selection menus.
 *
 * @summary Floating contextual action toolbar.
 */
export function HoveringBar({ children, className, size }: HoveringBarProps) {
  return (
    <div className={cn(hoveringBarVariants({ size }), className)}>
      <ScrollArea orientation="horizontal" hideScrollBar className="h-full">
        <div className="flex items-center gap-1">{children}</div>
      </ScrollArea>
    </div>
  );
}

function HoveringBarSeparator() {
  return <Separator orientation="vertical" className="my-1" />;
}

HoveringBar.Separator = HoveringBarSeparator;
