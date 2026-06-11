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
        className={cn(
          "s:mx-auto s:w-full s:bg-background s:@container s:dark:bg-background-night",
          className
        )}
        {...props}
      >
        <ScrollArea className="s:h-full" hideScrollBar>
          <div
            className={cn({
              "s:mx-auto s:max-w-4xl": fixed,
              "s:px-3 s:py-8 s:@sm:px-6 s:@md:px-9 s:@lg:px-12": !noPadding,
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
