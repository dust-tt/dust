import { cn } from "@sparkle/lib/utils";
import React from "react";

const LOADING_DOT_DELAYS = ["0ms", "250ms", "500ms"];

interface LoadMoreProps {
  showDetails?: boolean;
  /** Number of rows currently loaded. */
  rowCount: number;
  /** Total number of rows available, when known. */
  totalRowCount?: number;
  totalRowCountIsCapped?: boolean;
  isLoading?: boolean;
  onLoadMore: () => void;
  label?: string;
  loadingLabel?: string;
}

export function LoadMore({
  showDetails = true,
  rowCount,
  totalRowCount,
  totalRowCountIsCapped = false,
  isLoading = false,
  onLoadMore,
  label = "Load more",
  loadingLabel = "Loading",
}: LoadMoreProps) {
  // When the total is known and everything is loaded, there is nothing left to
  // fetch: keep the details, hide the control (same behavior as Pagination).
  const controlIsHidden =
    totalRowCount !== undefined &&
    !totalRowCountIsCapped &&
    rowCount >= totalRowCount;

  return (
    <div
      className={cn(
        "flex w-full items-center",
        controlIsHidden ? "justify-end" : "justify-between"
      )}
    >
      <button
        className={cn(
          "text-xs font-medium",
          "transition-colors duration-200",
          "text-primary-400 hover:text-foreground disabled:hover:text-primary-400",
          controlIsHidden ? "invisible" : "visible"
        )}
        onClick={onLoadMore}
        disabled={isLoading || controlIsHidden}
      >
        {isLoading ? (
          <span>
            {loadingLabel}
            {LOADING_DOT_DELAYS.map((delay) => (
              <span
                key={delay}
                className="animate-loading-dot opacity-100 motion-reduce:animate-none"
                style={{ animationDelay: delay }}
              >
                .
              </span>
            ))}
          </span>
        ) : (
          label
        )}
      </button>

      <span
        className={cn(
          "text-xs",
          "text-muted-foreground",
          showDetails ? "visible" : "collapse"
        )}
      >
        {totalRowCount === undefined
          ? `${rowCount} item${rowCount === 1 ? "" : "s"}`
          : `Showing ${rowCount} of ${totalRowCount}${
              totalRowCountIsCapped ? "+" : ""
            } item${totalRowCount === 1 ? "" : "s"}`}
      </span>
    </div>
  );
}
