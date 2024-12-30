import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import * as React from "react";

import { cn } from "@sparkle/lib/utils";

export interface ScrollAreaProps
  extends React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> {
  hideScrollBar?: boolean;
}

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  ScrollAreaProps
>(({ className, children, hideScrollBar = false, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn("s-relative s-z-20 s-overflow-hidden", className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport className="s-h-full s-w-full s-rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    {!hideScrollBar && <ScrollBar />}
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "s-flex s-touch-none s-select-none s-transition-colors",
      orientation === "vertical" &&
        "s-h-full s-w-3 s-border-l s-border-l-transparent s-px-[3px] s-py-3",
      orientation === "horizontal" &&
        "s-h-3 s-flex-col s-border-t s-border-t-transparent s-px-3 s-py-[3px]",
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="s-relative s-flex-1 s-rounded-full s-bg-muted-foreground/40" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };
