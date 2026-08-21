import { cn } from "@sparkle/lib/utils";
import * as React from "react";

import { LoadingBlock } from "./LoadingBlock";

const LABEL_WIDTHS = ["w-32", "w-48", "w-28", "w-40", "w-36"];

interface DataTableLoadingSkeletonProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of placeholder rows to render (default 5). */
  rows?: number;
  /** Includes a leading checkbox-shaped block, matching a selectable table (default true). */
  showSelectionColumn?: boolean;
  /** Includes a trailing pill-shaped block, matching a table with a trailing cell. */
  showTrailingCell?: boolean;
}

/**
 * A skeleton placeholder mirroring the layout of a DataTable /
 * ScrollableDataTable list, built on LoadingBlock, so the swap to real
 * content feels seamless. Use it while loading rows whose shape is known
 * ahead of time; for an indeterminate load with no known layout, use a
 * Spinner instead.
 * @summary Loading placeholder shaped like table rows.
 */
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
