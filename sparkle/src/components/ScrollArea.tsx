import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import * as React from "react";
import { useMemo } from "react";

import { cn } from "@sparkle/lib/utils";

export interface ScrollAreaProps
  extends React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> {
  hideScrollBar?: boolean;
}

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn("s-relative s-z-20 s-overflow-hidden", className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport className="s-h-full s-w-full s-rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const scrollBarSizes = {
  compact: {
    bar: {
      vertical: "s-w-5",
      horizontal: "s-h-5",
    },
    padding: {
      vertical: "s-pr-1 s-pl-2.5 s-py-2 hover:s-pl-2",
      horizontal: "s-pb-1 s-pt-2.5 s-px-2",
    },
    thumb: "s-bg-muted-foreground/40 hover:s-bg-muted-foreground/70",
  },
  classic: {
    bar: {
      vertical: "s-w-5",
      horizontal: "s-h-5",
    },
    padding: {
      vertical: "s-pl-2 s-pr-1 s-py-1",
      horizontal: "s-py-0.5 s-px-1",
    },
    thumb: "s-bg-muted-foreground/70 hover:s-bg-muted-foreground/80",
  },
} as const;

type ScrollBarSize = keyof typeof scrollBarSizes;

interface ScrollBarProps
  extends React.ComponentPropsWithoutRef<
    typeof ScrollAreaPrimitive.ScrollAreaScrollbar
  > {
  size?: ScrollBarSize;
}

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
export type { ScrollBarSize };
