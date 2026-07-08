import { ScrollArea, ScrollBar } from "@sparkle/components/ScrollArea";
import { cn } from "@sparkle/lib";
import React from "react";

interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  fixed?: boolean;
  noPadding?: boolean;
}

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
