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
  ScrollAreaProps
>(({ className, children, hideScrollBar = false, ...props }, ref) => {
  const hasCustomScrollBar = useMemo(
    () =>
      React.Children.toArray(children).some(
        (child) =>
          React.isValidElement(child) &&
          (child.type as typeof ScrollBar).displayName === ScrollBar.displayName
      ),
    [children]
  );

  const shouldHideDefaultScrollBar = hideScrollBar || hasCustomScrollBar;

  return (
    <ScrollAreaPrimitive.Root
      ref={ref}
      className={cn([
        [
          "s-relative",
          "s-z-20",
          "s-overflow-hidden"
        ].join(" "),
        className
      ])}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport className="s-h-full s-w-full s-rounded-[inherit]">
        {children}
      </ScrollAreaPrimitive.Viewport>
      {!shouldHideDefaultScrollBar && <ScrollBar />}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
});

ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const scrollBarSizes = {
  compact: {
    bar: {
      vertical: "s-w-5",
      horizontal: "s-h-5",
    },
    padding: {
      vertical: [
        "s-pr-1",
        "s-pl-2.5",
        "s-py-2",
        "hover:s-pl-2"
      ].join(" "),
      horizontal: [
        "s-pb-1",
        "s-pt-2.5",
        "s-px-2"
      ].join(" "),
    },
    thumb: [
      "s-bg-muted-foreground/40 dark:s-bg-muted-foreground-darkMode/40",
      "hover:s-bg-muted-foreground/70 dark:hover:s-bg-muted-foreground-darkMode/70"
    ].join(" "),
  },
  classic: {
    bar: {
      vertical: "s-w-5",
      horizontal: "s-h-5",
    },
    padding: {
      vertical: [
        "s-pl-2",
        "s-pr-1",
        "s-py-1"
      ].join(" "),
      horizontal: [
        "s-py-0.5",
        "s-px-1"
      ].join(" "),
    },
    thumb: [
      "s-bg-muted-foreground/70 dark:s-bg-muted-foreground-darkMode/70",
      "hover:s-bg-muted-foreground/80 dark:hover:s-bg-muted-foreground-darkMode/80"
    ].join(" "),
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
        className={cn([
          [
            "s-flex",
            "s-touch-none",
            "s-select-none",
            "hover:s-cursor-pointer"
          ].join(" "),
          orientation === "vertical" && [
            "s-h-full s-border-l s-border-l-transparent",
            sizeConfig.bar.vertical,
            sizeConfig.padding.vertical,
          ].filter(Boolean).join(" "),
          orientation === "horizontal" && [
            "s-flex-col s-border-t s-border-t-transparent",
            sizeConfig.bar.horizontal,
            sizeConfig.padding.horizontal,
          ].filter(Boolean).join(" "),
          className
        ])}
        {...props}
      >
        <ScrollAreaPrimitive.ScrollAreaThumb
          className={cn([
            [
              "s-relative",
              "s-flex-1",
              "s-rounded-full",
              "s-transition-colors s-duration-200",
              sizeConfig.thumb
            ].join(" ")
          ])}
        />
      </ScrollAreaPrimitive.ScrollAreaScrollbar>
    );
  }
);

ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };
export type { ScrollBarSize };
