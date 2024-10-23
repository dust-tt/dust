import * as React from "react";

import { cn } from "@sparkle/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("s-animate-pulse s-rounded-md s-bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
