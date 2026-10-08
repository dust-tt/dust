import { Plural, Trans } from "@lingui/react/macro";
import { ChevronLeft, ChevronRight } from "@sparkle/icons/v2-stroke";
import { formatNumber, useFormatLocale } from "@sparkle/lib/i18n/format";
import type { SparkleFormatLocale } from "@sparkle/lib/i18n/locales";
import { cn } from "@sparkle/lib/utils";
import type { PaginationState } from "@tanstack/react-table";
import React, { useCallback } from "react";
import { Button } from "./Button";

type Size = "sm" | "xs";

const pagesShownInControls = 7;

interface PaginationProps {
  size?: Size;
  /** Show the "Showing X-Y of N items" range summary (default true). */
  showDetails?: boolean;
  /** Show the numbered page buttons between the arrows (default true). */
  showPageButtons?: boolean;
  /** Total number of rows in the dataset, used to derive the page count. */
  rowCount: number;
  /** Flag `rowCount` as a lower-bound estimate; appends "+" to the range summary. */
  rowCountIsCapped?: boolean;
  /** Current page state (`pageIndex` is 0-based); the caller owns this state. */
  pagination: PaginationState;
  /** Called with the new pagination state when the user navigates. */
  setPagination: (pagination: PaginationState) => void;
  /** Render the page numbers as inert text instead of clickable buttons. */
  disablePaginationNumbers?: boolean;
}

/**
 * A controlled pager for tabular or list data: it derives the page count from
 * `rowCount` and the current `pagination` state, and reports changes through
 * `setPagination`. Use it to page through a large dataset rendered in chunks,
 * e.g. a table backed by @tanstack/react-table.
 * @summary Controlled pager for tables and lists.
 */
/**
 * @cc [owner:aubin-tchoi,label:product] pagination-narrow-layout
 * Below 768px viewport width, the range summary MUST wrap below the page controls when
 * they do not fit on one line. Desktop layout MUST remain unchanged.
 */
export function Pagination({
  size = "sm",
  showDetails = true,
  showPageButtons = true,
  rowCount,
  rowCountIsCapped = false,
  pagination,
  setPagination,
  disablePaginationNumbers = false,
}: PaginationProps) {
  // pageIndex is 0-based
  const { pageIndex, pageSize } = pagination;

  const numPages = Math.ceil(rowCount / pageSize);

  const canNextPage = pagination.pageIndex < numPages - 1;
  const canPreviousPage = pageIndex > 0;
  const nextPage = () => setPagination({ pageSize, pageIndex: pageIndex + 1 });
  const previousPage = () =>
    setPagination({ pageSize, pageIndex: pageIndex - 1 });

  const controlsAreHidden = Boolean(numPages <= 1);
  const firstItemOnPageIndex = pageIndex * pageSize + 1;
  const lastItemOnPageIndex =
    rowCount > (pageIndex + 1) * pageSize
      ? (pageIndex + 1) * pageSize
      : rowCount;

  const onPaginationButtonClick = useCallback(
    (pageIndex: number) => {
      setPagination({ pageSize, pageIndex });
    },
    [pageSize, setPagination]
  );

  const formatLocale = useFormatLocale();
  const pageButtons: React.ReactNode[] = getPageButtons(
    pageIndex,
    numPages,
    pagesShownInControls,
    size,
    formatLocale,
    !disablePaginationNumbers ? onPaginationButtonClick : undefined
  );

  return (
    <div
      className={cn(
        "flex w-full items-center max-md:flex-wrap max-md:gap-2",
        controlsAreHidden ? "justify-end" : "justify-between"
      )}
    >
      <div
        className={cn(
          "flex max-md:shrink-0",
          controlsAreHidden ? "invisible" : "visible",
          showPageButtons ? "gap-0" : "gap-2"
        )}
      >
        <Button
          variant="outline"
          size="xs"
          disabled={!canPreviousPage}
          icon={ChevronLeft}
          onClick={previousPage}
        />

        <div
          className={cn(
            "items-center",
            size === "xs" ? "gap-3 px-3" : "gap-4 px-4",
            showPageButtons ? "flex" : "hidden"
          )}
        >
          {pageButtons}
        </div>

        <Button
          variant="outline"
          size="xs"
          disabled={!canNextPage}
          icon={ChevronRight}
          onClick={nextPage}
        />
      </div>

      <span
        className={cn(
          "text-xs",
          "text-muted-foreground",
          showDetails ? "visible" : "collapse"
        )}
      >
        <PaginationDetails
          controlsAreHidden={controlsAreHidden}
          rowCount={rowCount}
          rowCountIsCapped={rowCountIsCapped}
          firstItemOnPageIndex={firstItemOnPageIndex}
          lastItemOnPageIndex={lastItemOnPageIndex}
        />
      </span>
    </div>
  );
}

interface PaginationDetailsProps {
  controlsAreHidden: boolean;
  rowCount: number;
  rowCountIsCapped: boolean;
  firstItemOnPageIndex: number;
  lastItemOnPageIndex: number;
}

function PaginationDetails({
  controlsAreHidden,
  rowCount,
  rowCountIsCapped,
  firstItemOnPageIndex,
  lastItemOnPageIndex,
}: PaginationDetailsProps) {
  const formatLocale = useFormatLocale();
  // Plural forms are picked with `rowCount`, but `#` would format it in the catalog's locale.
  const formattedRowCount = formatNumber(rowCount, undefined, formatLocale);
  const firstItem = formatNumber(firstItemOnPageIndex, undefined, formatLocale);
  const lastItem = formatNumber(lastItemOnPageIndex, undefined, formatLocale);

  if (controlsAreHidden) {
    return (
      <Plural
        value={rowCount}
        one={`${formattedRowCount} item`}
        other={`${formattedRowCount} items`}
      />
    );
  }

  if (rowCountIsCapped) {
    return (
      <Trans>
        Showing {firstItem}-{lastItem} of{" "}
        <Plural
          value={rowCount}
          one={`${formattedRowCount}+ item`}
          other={`${formattedRowCount}+ items`}
        />
      </Trans>
    );
  }

  return (
    <Trans>
      Showing {firstItem}-{lastItem} of{" "}
      <Plural
        value={rowCount}
        one={`${formattedRowCount} item`}
        other={`${formattedRowCount} items`}
      />
    </Trans>
  );
}

function renderPageNumber(
  pageNumber: number,
  currentPage: number,
  size: Size,
  formatLocale: SparkleFormatLocale | undefined,
  onPageClick?: (currentPage: number) => void
) {
  return (
    <button
      key={pageNumber}
      className={cn(
        "font-medium transition-colors duration-200",
        currentPage === pageNumber ? "text-foreground" : "text-primary-400",
        size === "xs" ? "text-xs" : "text-sm"
      )}
      onClick={() => onPageClick && onPageClick(pageNumber)}
      disabled={!onPageClick}
    >
      {formatNumber(pageNumber + 1, undefined, formatLocale)}
    </button>
  );
}

function renderEllipses(size: "sm" | "xs") {
  return (
    <span
      className={cn(
        "text-sm font-medium",
        "text-muted-foreground",
        size === "xs" ? "text-xs" : "text-sm"
      )}
    >
      ...
    </span>
  );
}

function getPageButtons(
  currentPage: number,
  totalPages: number,
  slots: number,
  size: Size,
  formatLocale: SparkleFormatLocale | undefined,
  onPageClick?: (currentPage: number) => void
) {
  const pagination: React.ReactNode[] = [];

  // If total pages are less than or equal to slots, show all pages
  if (totalPages <= slots) {
    for (let i = 0; i < totalPages; i++) {
      pagination.push(
        renderPageNumber(i, currentPage, size, formatLocale, onPageClick)
      );
    }
    return pagination;
  }

  const remainingSlots = slots - 2; // slots excluding first and last page
  const halfSlots = Math.floor(remainingSlots / 2);

  // Ensure current page is within bounds
  currentPage = Math.max(0, Math.min(currentPage, totalPages - 1));

  pagination.push(
    renderPageNumber(0, currentPage, size, formatLocale, onPageClick)
  ); // Always show the first page
  // Determine the range of pages to display
  let start, end;
  if (currentPage <= halfSlots + 1) {
    start = 1;
    end = remainingSlots - 1;
  } else if (currentPage >= totalPages - halfSlots - 2) {
    start = totalPages - remainingSlots;
    end = totalPages - 2;
  } else {
    start = currentPage - halfSlots + 1;
    end = currentPage + halfSlots - 1;
  }
  // Add ellipsis if there is a gap between the first page and the start of the range
  if (start > 1) {
    pagination.push(renderEllipses(size));
  }

  // Add the range of pages
  for (let i = start; i <= end; i++) {
    pagination.push(
      renderPageNumber(i, currentPage, size, formatLocale, onPageClick)
    );
  }

  // Add ellipsis if there is a gap between the end of the range and the last page
  if (end < totalPages - 2) {
    pagination.push(renderEllipses(size));
  }

  pagination.push(
    renderPageNumber(
      totalPages - 1,
      currentPage,
      size,
      formatLocale,
      onPageClick
    )
  ); // Always show the last page

  return pagination;
}
