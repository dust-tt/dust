import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import * as React from "react";
import { useMemo } from "react";

import { cn } from "@sparkle/lib/utils";

interface ScrollAreaProps
  extends React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> {
  hideScrollBar?: boolean;
  orientation?: "vertical" | "horizontal";
  scrollBarClassName?: string;
  viewportClassName?: string;
  scrollStyles?: {
    active?: string;
    inactive?: string;
  };
  viewportRef?: React.RefObject<HTMLDivElement>;
}

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  ScrollAreaProps
>(
  (
    {
      className,
      children,
      hideScrollBar = false,
      orientation = "vertical",
      scrollBarClassName,
      viewportClassName,
      scrollStyles,
      viewportRef,
      ...props
    },
    ref
  ) => {
    const localViewportRef = React.useRef<HTMLDivElement>(null);
    const [isScrolled, setIsScrolled] = React.useState(false);

    const hasCustomScrollBar = useMemo(
      () =>
        React.Children.toArray(children).some(
          (child) =>
            React.isValidElement(child) &&
            (child.type as typeof ScrollBar).displayName ===
              ScrollBar.displayName
        ),
      [children]
    );

    const shouldHideDefaultScrollBar = hideScrollBar || hasCustomScrollBar;

    const handleScroll = React.useCallback(() => {
      if (viewportRef && viewportRef.current) {
        setIsScrolled(viewportRef.current.scrollTop > 0);
      }

      if (localViewportRef.current) {
        setIsScrolled(localViewportRef.current.scrollTop > 0);
      }
    }, []);

    return (
      <ScrollAreaPrimitive.Root
        ref={ref}
        className={cn(
          "s-relative s-z-20 s-overflow-hidden s-transition-all s-duration-200",
          isScrolled ? scrollStyles?.active : scrollStyles?.inactive,
          className
        )}
        {...props}
      >
        <ScrollAreaPrimitive.Viewport
          ref={viewportRef || localViewportRef}
          onScroll={handleScroll}
          className={cn(
            "s-h-full s-w-full s-rounded-[inherit]",
            viewportClassName
          )}
        >
          {children}
        </ScrollAreaPrimitive.Viewport>
        {!shouldHideDefaultScrollBar && (
          <ScrollBar orientation={orientation} className={scrollBarClassName} />
        )}
        <ScrollAreaPrimitive.Corner />
      </ScrollAreaPrimitive.Root>
    );
  }
);
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
    thumb: cn(
      "s-bg-muted-foreground/40 dark:s-bg-muted-foreground-night/40",
      "hover:s-bg-muted-foreground/70 dark:hover:s-bg-muted-foreground-night/70"
    ),
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
    thumb: cn(
      "s-bg-muted-foreground/70 dark:s-bg-muted-foreground-night/70",
      "hover:s-bg-muted-foreground/80 dark:hover:s-bg-muted-foreground-night/80"
    ),
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
  ScrollBarProps
>(
  (
    { className, orientation = "vertical", size = "compact", ...props },
    ref
  ) => {
    const sizeConfig = scrollBarSizes[size];

    return (
      <ScrollAreaPrimitive.ScrollAreaScrollbar
        ref={ref}
        orientation={orientation}
        className={cn(
          "s-flex s-touch-none s-select-none hover:s-cursor-pointer",
          orientation === "vertical" && [
            "s-h-full s-border-l s-border-l-transparent",
            sizeConfig.bar.vertical,
            sizeConfig.padding.vertical,
          ],
          orientation === "horizontal" && [
            "s-flex-col s-border-t s-border-t-transparent",
            sizeConfig.bar.horizontal,
            sizeConfig.padding.horizontal,
          ],
          className
        )}
        {...props}
      >
        <ScrollAreaPrimitive.ScrollAreaThumb
          className={cn(
            "s-relative s-flex-1 s-rounded-full s-transition-colors s-duration-200",
            sizeConfig.thumb
          )}
        />
      </ScrollAreaPrimitive.ScrollAreaScrollbar>
    );
  }
);

ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };
export type { ScrollAreaProps, ScrollBarSize };
