import * as React from "react";

import { cn } from "@sparkle/lib/utils";

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
