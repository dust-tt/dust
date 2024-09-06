import { PaginationState } from "@tanstack/react-table";
import React, { useCallback, useMemo } from "react";
import useHashParam from "use-hash-param";

import { ChevronLeftIcon, ChevronRightIcon } from "@sparkle/icons/solid";
import { classNames } from "@sparkle/lib/utils";

import { Button } from "./Button";

type Size = "sm" | "xs";

const pagesShownInControls = 7;
const defaultPageSize = 25;

export const usePaginationFromUrl = (
  urlPrefix?: string,
  initialPageSize = defaultPageSize
) => {
  const [pageIndexParam, setPageIndexParam] = useHashParam(
    urlPrefix ? `${urlPrefix}PageIndex` : "pageIndex"
  );
  const [pageSizeParam, setPageSizeParam] = useHashParam(
    urlPrefix ? `${urlPrefix}PageSize` : "pageSize"
  );

  const pageIndex = pageIndexParam ? parseInt(pageIndexParam) : 0;
  const pageSize = pageSizeParam ? parseInt(pageSizeParam) : initialPageSize;

  const res = useMemo(() => {
    const pagination: PaginationState = { pageIndex, pageSize };

    const setPagination = (newValue: PaginationState) => {
      if (newValue.pageIndex !== pageIndex || newValue.pageSize !== pageSize) {
        setPageIndexParam(newValue.pageIndex.toString());
        setPageSizeParam(newValue.pageSize.toString());
      }
    };

    return { pagination, setPagination };
  }, [pageIndex, pageSize, urlPrefix]);

  return res;
};

type PaginationProps = {
  size?: Size;
  showDetails?: boolean;
  showPageButtons?: boolean;
  rowCount: number;
  pageSize: number;
  pageIndex: number;
  setPageIndex: (pageNumber: number) => void;
};

export function Pagination({
  size = "sm",
  showDetails = true,
  showPageButtons = true,
  rowCount,
  pageSize = defaultPageSize,
  pageIndex,
  setPageIndex,
}: PaginationProps) {
  const numPages = Math.ceil(rowCount / pageSize);

  // pageIndex is 0-based
  const canNextPage = pageIndex < numPages - 1;
  const canPreviousPage = pageIndex > 0;
  const nextPage = () => setPageIndex(pageIndex + 1);
  const previousPage = () => setPageIndex(pageIndex - 1);

  const controlsAreHidden = Boolean(numPages <= 1);
  const firstItemOnPageIndex = pageIndex * pageSize + 1;
  const lastItemOnPageIndex =
    rowCount > (pageIndex + 1) * pageSize
      ? (pageIndex + 1) * pageSize
      : rowCount;

  const onPaginationButtonClick = useCallback(
    (pageNb: number) => {
      setPageIndex(pageNb);
    },
    [pageIndex, setPageIndex]
  );

  const pageButtons: React.ReactNode[] = getPageButtons(
    pageIndex,
    numPages,
    pagesShownInControls,
    onPaginationButtonClick,
    size
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
          variant="tertiary"
          size={size === "xs" ? "xs" : "sm"}
          label="previous"
          labelVisible={false}
          disabledTooltip={true}
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
          variant="tertiary"
          size={size === "xs" ? "xs" : "sm"}
          label="next"
          labelVisible={false}
          disabledTooltip={true}
          disabled={!canNextPage}
          icon={ChevronRightIcon}
          onClick={nextPage}
        />
      </div>

      <span
        className={classNames(
          "s-text-slate-400",
          size === "xs" ? "s-text-xs" : "s-text-sm",
          showDetails ? "s-visible" : "s-collapse"
        )}
      >
        {controlsAreHidden
          ? `${rowCount} items`
          : `Showing ${firstItemOnPageIndex}-${lastItemOnPageIndex} of ${rowCount} items`}
      </span>
    </div>
  );
}

function renderPageNumber(
  pageNumber: number,
  currentPage: number,
  onPageClick: (currentPage: number) => void,
  size: Size
) {
  return (
    <button
      key={pageNumber}
      className={classNames(
        "s-font-semibold s-transition-colors s-duration-100",
        currentPage === pageNumber ? "s-text-action-500" : "s-text-slate-400",
        size === "xs" ? "s-text-xs" : "s-text-sm"
      )}
      onClick={() => onPageClick(pageNumber)}
    >
      {pageNumber + 1}
    </button>
  );
}

function renderEllipses(size: "sm" | "xs") {
  return (
    <span
      className={classNames(
        "s-text-sm s-font-semibold s-text-slate-400",
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
  onPageClick: (currentPage: number) => void,
  size: Size
) {
  const pagination: React.ReactNode[] = [];

  // If total pages are less than or equal to slots, show all pages
  if (totalPages <= slots) {
    for (let i = 0; i < totalPages; i++) {
      pagination.push(renderPageNumber(i, currentPage, onPageClick, size));
    }
    return pagination;
  }

  const remainingSlots = slots - 2; // slots excluding first and last page
  const halfSlots = Math.floor(remainingSlots / 2);

  // Ensure current page is within bounds
  currentPage = Math.max(0, Math.min(currentPage, totalPages - 1));

  pagination.push(renderPageNumber(0, currentPage, onPageClick, size)); // Always show the first page
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
    pagination.push(renderPageNumber(i, currentPage, onPageClick, size));
  }

  // Add ellipsis if there is a gap between the end of the range and the last page
  if (end < totalPages - 2) {
    pagination.push(renderEllipses(size));
  }

  pagination.push(
    renderPageNumber(totalPages - 1, currentPage, onPageClick, size)
  ); // Always show the last page

  return pagination;
}
