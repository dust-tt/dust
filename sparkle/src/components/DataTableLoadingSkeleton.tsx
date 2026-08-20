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
      <div className="flex h-8 items-center border-b border-separator">
        {showSelectionColumn && (
          <div className="flex w-10 shrink-0 items-center px-2">
            <LoadingBlock className="h-4 w-4 rounded-md" />
          </div>
        )}
        <div className="flex min-w-0 flex-1 items-center px-2">
          <LoadingBlock className="h-3 w-20" />
        </div>
        {showTrailingCell && (
          <div className="flex w-28 shrink-0 items-center px-2">
            <LoadingBlock className="h-3 w-16" />
          </div>
        )}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex h-12 items-center border-b border-separator"
        >
          {showSelectionColumn && (
            <div className="flex w-10 shrink-0 items-center px-2">
              <LoadingBlock className="h-4 w-4 rounded-md" />
            </div>
          )}
          <div className="flex min-w-0 flex-1 items-center px-2">
            <LoadingBlock
              className={cn("h-4", LABEL_WIDTHS[i % LABEL_WIDTHS.length])}
            />
          </div>
          {showTrailingCell && (
            <div className="flex w-28 shrink-0 items-center px-2">
              <LoadingBlock className="h-5 w-24 rounded-full" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export { DataTableLoadingSkeleton };
