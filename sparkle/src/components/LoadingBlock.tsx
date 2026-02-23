import { cn } from "@sparkle/lib/utils";
import * as React from "react";

function LoadingBlock({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "s-animate-opacity-pulse s-rounded-md",
        "s-bg-muted dark:s-bg-muted-background-night",
        className
      )}
      {...props}
    />
  );
}

export { LoadingBlock };
