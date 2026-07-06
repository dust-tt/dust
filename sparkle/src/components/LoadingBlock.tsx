import { cn } from "@sparkle/lib/utils";
import * as React from "react";

function LoadingBlock({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-opacity-pulse rounded-md",
        "bg-loading",
        className
      )}
      {...props}
    />
  );
}

export { LoadingBlock };
