import { PaginationState } from "@tanstack/react-table";
import React, { useCallback } from "react";

import { ChevronLeftIcon, ChevronRightIcon } from "@sparkle/icons/solid";
import { classNames } from "@sparkle/lib/utils";

import { Button } from "./Button";

type Size = "sm" | "xs";

const pagesShownInControls = 7;

interface PaginationProps {
  size?: Size;
  showDetails?: boolean;
  showPageButtons?: boolean;
  rowCount: number;
  rowCountIsCapped?: boolean;
  pagination: PaginationState;
  setPagination: (pagination: PaginationState) => void;
  disablePaginationNumbers?: boolean;
}

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
    [pageIndex, setPagination]
  );

  const pageButtons: React.ReactNode[] = getPageButtons(
    pageIndex,
    numPages,
    pagesShownInControls,
    size,
    !disablePaginationNumbers ? onPaginationButtonClick : undefined
  );

  return (
    <div
      className={classNames(
        "s-flex s-w-full s-items-center",
        controlsAreHidden ? "s-justify-end" : "s-justify-between"
      )}
    >
      <div
        className={classNames(
          "s-flex",
          controlsAreHidden ? "s-invisible" : "s-visible",
          showPageButtons ? "s-gap-0" : "s-gap-2"
        )}
      >
        <Button
          variant="outline"
          size="xs"
          disabled={!canPreviousPage}
          icon={ChevronLeftIcon}
          onClick={previousPage}
        />

        <div
          className={classNames(
            "s-items-center",
            size === "xs" ? "s-gap-3 s-px-3" : "s-gap-4 s-px-4",
            showPageButtons ? "s-flex" : "s-hidden"
          )}
        >
          {pageButtons}
        </div>

        <Button
          variant="outline"
          size="xs"
          disabled={!canNextPage}
          icon={ChevronRightIcon}
          onClick={nextPage}
        />
      </div>

      <span
        className={classNames(
          "s-text-xs",
          "s-text-muted-foreground dark:s-text-muted-foreground-night",
          showDetails ? "s-visible" : "s-collapse"
        )}
      >
        {controlsAreHidden
          ? `${rowCount} items`
          : `Showing ${firstItemOnPageIndex}-${lastItemOnPageIndex} of ${rowCount}${
              rowCountIsCapped ? "+" : ""
            } items`}
      </span>
    </div>
  );
}

function renderPageNumber(
  pageNumber: number,
  currentPage: number,
  size: Size,
  onPageClick?: (currentPage: number) => void
) {
  return (
    <button
      key={pageNumber}
      className={classNames(
        "s-font-medium s-transition-colors s-duration-200",
        currentPage === pageNumber
          ? "s-text-foreground dark:s-text-foreground-night"
          : "s-text-primary-400 dark:s-text-primary-400-night",
        size === "xs" ? "s-text-xs" : "s-text-sm"
      )}
      onClick={() => onPageClick && onPageClick(pageNumber)}
      disabled={!onPageClick}
    >
      {pageNumber + 1}
    </button>
  );
}

function renderEllipses(size: "sm" | "xs") {
  return (
    <span
      className={classNames(
        "s-text-sm s-font-medium",
        "s-text-muted-foreground dark:s-text-muted-foreground-night",
        size === "xs" ? "s-text-xs" : "s-text-sm"
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
  onPageClick?: (currentPage: number) => void
) {
  const pagination: React.ReactNode[] = [];

  // If total pages are less than or equal to slots, show all pages
  if (totalPages <= slots) {
    for (let i = 0; i < totalPages; i++) {
      pagination.push(renderPageNumber(i, currentPage, size, onPageClick));
    }
    return pagination;
  }

  const remainingSlots = slots - 2; // slots excluding first and last page
  const halfSlots = Math.floor(remainingSlots / 2);

  // Ensure current page is within bounds
  currentPage = Math.max(0, Math.min(currentPage, totalPages - 1));

  pagination.push(renderPageNumber(0, currentPage, size, onPageClick)); // Always show the first page
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
    pagination.push(renderPageNumber(i, currentPage, size, onPageClick));
  }

  // Add ellipsis if there is a gap between the end of the range and the last page
  if (end < totalPages - 2) {
    pagination.push(renderEllipses(size));
  }

  pagination.push(
    renderPageNumber(totalPages - 1, currentPage, size, onPageClick)
  ); // Always show the last page

  return pagination;
}
