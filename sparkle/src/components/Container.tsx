import React from "react";

import { ScrollArea } from "@sparkle/components";
import { cn } from "@sparkle/lib";

interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  fixed?: boolean;
}

export const Container = React.forwardRef<HTMLDivElement, ContainerProps>(
  ({ children, fixed = false, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("s-w-full s-bg-white s-@container", className)}
        {...props}
      >
        <ScrollArea className="s-h-full">
          <div
            className={cn("s-px-3 s-py-8 @sm:s-px-6 @md:s-px-9 @lg:s-px-12", {
              "s-mx-auto s-max-w-4xl": fixed,
            })}
          >
            {children}
          </div>
        </ScrollArea>
      </div>
    );
  }
);

Container.displayName = "Container";
