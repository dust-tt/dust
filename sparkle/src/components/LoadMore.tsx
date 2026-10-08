import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { formatNumber, useFormatLocale } from "@sparkle/lib/i18n/format";
import { cn } from "@sparkle/lib/utils";
import React from "react";

const LOADING_DOT_DELAY_CLASS_NAMES = [
  "[animation-delay:0ms]",
  "[animation-delay:250ms]",
  "[animation-delay:500ms]",
];

const CONTROL_CLASS_NAME = cn(
  "text-xs font-medium",
  "transition-colors duration-200",
  "text-primary-400 hover:text-foreground disabled:hover:text-primary-400"
);

interface LoadMoreProps {
  showDetails?: boolean;
  /** Number of rows currently loaded. */
  rowCount: number;
  /** Total number of rows available, when known. */
  totalRowCount?: number;
  totalRowCountIsCapped?: boolean;
  isLoading?: boolean;
  onLoadMore: () => void;
  /** Renders a "Show less" control; pass it only once extra rows are revealed. */
  onShowLess?: () => void;
  label?: string;
  loadingLabel?: string;
  showLessLabel?: string;
}

export function LoadMore({
  showDetails = true,
  rowCount,
  totalRowCount,
  totalRowCountIsCapped = false,
  isLoading = false,
  onLoadMore,
  onShowLess,
  label,
  loadingLabel,
  showLessLabel,
}: LoadMoreProps) {
  const { t } = useLingui();
  const formatLocale = useFormatLocale();
  // Plural forms are picked with the counts, but `#` would format them in the catalog's locale.
  const formattedRowCount = formatNumber(rowCount, undefined, formatLocale);
  const formattedTotalRowCount =
    totalRowCount === undefined
      ? undefined
      : formatNumber(totalRowCount, undefined, formatLocale);
  // When the total is known and everything is loaded, there is nothing left to
  // fetch: keep the details, hide the control (same behavior as Pagination).
  const loadMoreIsHidden =
    totalRowCount !== undefined &&
    !totalRowCountIsCapped &&
    rowCount >= totalRowCount;

  return (
    <div className="flex w-full items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={cn(CONTROL_CLASS_NAME, loadMoreIsHidden && "hidden")}
          onClick={onLoadMore}
          disabled={isLoading || loadMoreIsHidden}
        >
          {isLoading ? (
            <span>
              {loadingLabel ?? t`Loading`}
              {LOADING_DOT_DELAY_CLASS_NAMES.map((delayClassName) => (
                <span
                  key={delayClassName}
                  className={cn(
                    "animate-loading-dot opacity-100 motion-reduce:animate-none",
                    delayClassName
                  )}
                >
                  .
                </span>
              ))}
            </span>
          ) : (
            (label ?? t`Load more`)
          )}
        </button>
        {onShowLess && (
          <button
            type="button"
            className={CONTROL_CLASS_NAME}
            onClick={onShowLess}
            disabled={isLoading}
          >
            {showLessLabel ?? t`Show less`}
          </button>
        )}
      </div>

      <span
        className={cn(
          "text-xs",
          "text-muted-foreground",
          showDetails ? "visible" : "collapse"
        )}
      >
        {totalRowCount === undefined ? (
          <Plural
            value={rowCount}
            one={`${formattedRowCount} item`}
            other={`${formattedRowCount} items`}
          />
        ) : totalRowCountIsCapped ? (
          <Trans>
            Showing {formattedRowCount} of{" "}
            <Plural
              value={totalRowCount}
              one={`${formattedTotalRowCount}+ item`}
              other={`${formattedTotalRowCount}+ items`}
            />
          </Trans>
        ) : (
          <Trans>
            Showing {formattedRowCount} of{" "}
            <Plural
              value={totalRowCount}
              one={`${formattedTotalRowCount} item`}
              other={`${formattedTotalRowCount} items`}
            />
          </Trans>
        )}
      </span>
    </div>
  );
}
