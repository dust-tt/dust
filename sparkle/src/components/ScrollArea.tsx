import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { cn } from "@sparkle/lib/utils";
import * as React from "react";
import { useMemo } from "react";

interface ScrollAreaProps
  extends React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> {
  /** Hide the built-in scrollbar entirely (it also auto-hides when a custom ScrollBar child is present). */
  hideScrollBar?: boolean;
  /** Axis of the default scrollbar rendered when no ScrollBar child is given. */
  orientation?: "vertical" | "horizontal";
  /** Horizontal: clip x-axis only so a parent/window can scroll vertically. */
  scrollContainment?: "default" | "horizontal";
  /** Class applied to the default scrollbar. */
  scrollBarClassName?: string;
  /** Class applied to the scroll viewport element. */
  viewportClassName?: string;
  /** Ref to the scroll viewport element, e.g. for scroll position control. */
  viewportRef?: React.Ref<HTMLDivElement>;
}

/**
 * A styled, cross-browser scroll container that replaces the native scrollbar
 * with a custom ScrollBar (one per scrolling axis). Use it to give bounded,
 * scrollable regions (lists, panels, popovers) a consistent scrollbar across
 * browsers; constrain it with an explicit height or width so it actually
 * scrolls.
 * @summary Scroll container with custom scrollbar.
 */
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
      scrollContainment = "default",
      scrollBarClassName,
      viewportClassName,
      viewportRef,
      ...props
    },
    ref
  ) => {
    const localViewportRef = React.useRef<HTMLDivElement>(null);

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

    return (
      <ScrollAreaPrimitive.Root
        ref={ref}
        className={cn(
          "relative z-20",
          scrollContainment === "horizontal"
            ? "overflow-x-auto overflow-y-visible"
            : "overflow-hidden",
          className
        )}
        {...props}
      >
        <ScrollAreaPrimitive.Viewport
          ref={viewportRef || localViewportRef}
          className={cn(
            "scrollarea-viewport h-full w-full rounded-[inherit]",
            viewportClassName
          )}
        >
          {children}
        </ScrollAreaPrimitive.Viewport>
        <ScrollBar
          orientation={orientation}
          className={cn(
            scrollBarClassName,
            shouldHideDefaultScrollBar && "hidden"
          )}
        />
        <ScrollAreaPrimitive.Corner />
      </ScrollAreaPrimitive.Root>
    );
  }
);
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const scrollBarSizes = {
  compact: {
    bar: {
      vertical: "w-5",
      horizontal: "h-5",
    },
    padding: {
      vertical: "pr-1 pl-2.5 py-2 hover:pl-2",
      horizontal: "pb-1 pt-2.5 px-2",
    },
    thumb: cn("bg-muted-foreground/40", "hover:bg-muted-foreground/70"),
  },
  classic: {
    bar: {
      vertical: "w-5",
      horizontal: "h-5",
    },
    padding: {
      vertical: "pl-2 pr-1 py-1",
      horizontal: "py-0.5 px-1",
    },
    thumb: cn("bg-muted-foreground/70", "hover:bg-muted-foreground/80"),
  },
  minimal: {
    bar: {
      vertical: "w-3",
      horizontal: "h-3",
    },
    padding: {
      vertical: "pr-px pl-1.5 py-px",
      horizontal: "pb-px pt-1.5 px-px",
    },
    thumb: cn("bg-muted-foreground/20", "hover:bg-muted-foreground/50"),
  },
} as const;

type ScrollBarSize = keyof typeof scrollBarSizes;

interface ScrollBarProps
  extends React.ComponentPropsWithoutRef<
    typeof ScrollAreaPrimitive.ScrollAreaScrollbar
  > {
  /** Visual style of the bar: `compact` (default), `classic`, or `minimal`. */
  size?: ScrollBarSize;
}

/**
 * The custom scrollbar of a ScrollArea, one per scrolling axis via
 * `orientation` (`vertical` / `horizontal`).
 * @summary Custom scrollbar for a ScrollArea.
 */
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
          "flex touch-none select-none hover:cursor-pointer",
          orientation === "vertical" && [
            "h-full border-l border-l-transparent",
            sizeConfig.bar.vertical,
            sizeConfig.padding.vertical,
          ],
          orientation === "horizontal" && [
            "flex-col border-t border-t-transparent",
            sizeConfig.bar.horizontal,
            sizeConfig.padding.horizontal,
          ],
          className
        )}
        {...props}
      >
        <ScrollAreaPrimitive.ScrollAreaThumb
          className={cn(
            "relative flex-1 rounded-full transition-colors duration-200",
            sizeConfig.thumb
          )}
        />
      </ScrollAreaPrimitive.ScrollAreaScrollbar>
    );
  }
);

ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export type { ScrollAreaProps, ScrollBarSize };
export { ScrollArea, ScrollBar };
