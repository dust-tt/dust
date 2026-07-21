import { cn } from "@sparkle/lib/utils";
import * as React from "react";

import { LoadingBlock } from "./LoadingBlock";

const LABEL_WIDTHS = ["w-32", "w-48", "w-28", "w-40", "w-36"];

interface DataTableLoadingSkeletonProps
  extends React.HTMLAttributes<HTMLDivElement> {
  rows?: number;
  showSelectionColumn?: boolean;
  showTrailingCell?: boolean;
}

function DataTableLoadingSkeleton({
  rows = 5,
  showSelectionColumn = true,
  showTrailingCell = false,
  className,
  ...props
}: DataTableLoadingSkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("flex w-full flex-col", className)}
      {...props}
    >
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex h-12 items-center gap-3 border-b border-separator px-2"
        >
          {showSelectionColumn && (
            <LoadingBlock className="h-5 w-5 shrink-0 rounded-md" />
          )}
          <LoadingBlock
            className={cn("h-4", LABEL_WIDTHS[i % LABEL_WIDTHS.length])}
          />
          {showTrailingCell && (
            <LoadingBlock className="ml-auto h-5 w-24 rounded-full" />
          )}
        </div>
      ))}
    </div>
  );
}

export { DataTableLoadingSkeleton };
