import { ScrollArea, ScrollBar } from "@sparkle/components/ScrollArea";
import { cn } from "@sparkle/lib";
import React from "react";

interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /** Clamps content to a centered max width (max-w-4xl) — for reading-width content such as forms and articles. */
  fixed?: boolean;
  /** Opts out of the default responsive horizontal/vertical padding. */
  noPadding?: boolean;
}

/**
 * A centered page wrapper with responsive horizontal padding and a built-in
 * vertical ScrollArea; it also establishes a CSS container context so
 * descendants can use `@container` queries. Use it as the outermost wrapper
 * for page or panel content that should scroll and stay centered, giving it a
 * bounded height (e.g. `h-full`) since it owns the scroll region.
 * @summary Centered scrollable page wrapper.
 */
export const Container = React.forwardRef<HTMLDivElement, ContainerProps>(
  (
    { children, fixed = false, noPadding = false, className, ...props },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn("mx-auto w-full @container", className)}
        {...props}
      >
        <ScrollArea className="h-full" hideScrollBar>
          <div
            className={cn({
              "mx-auto max-w-4xl": fixed,
              "px-3 py-8 @sm:px-6 @md:px-9 @lg:px-12": !noPadding,
            })}
          >
            {children}
          </div>
          <ScrollBar size="classic" orientation="vertical" />
        </ScrollArea>
      </div>
    );
  }
);

Container.displayName = "Container";
