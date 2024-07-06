import React, { useCallback } from "react";
import { useState } from "react";

import { ChevronLeftIcon, ChevronRightIcon } from "@sparkle/icons/solid";
import { classNames } from "@sparkle/lib/utils";

import { Button } from "./Button";

type Size = "sm" | "xs";

const pagesShownInControls = 7;

interface PaginationProps {
  itemsCount: number;
  maxItemsPerPage: number;
  onButtonClick: (pageNumber: number) => void;
  size?: Size;
  showDetails?: boolean;
  showPageButtons?: boolean;
}

export function Pagination({
  itemsCount,
  maxItemsPerPage,
  onButtonClick,
  size = "sm",
  showDetails = true,
  showPageButtons = true,
}: PaginationProps) {
  const numPages = Math.ceil(itemsCount / maxItemsPerPage);
  const controlsAreHidden = Boolean(numPages <= 1);
  const [currentPage, setCurrentPage] = useState(1);
  const firstFileOnPageIndex =
    currentPage * maxItemsPerPage - maxItemsPerPage + 1;
  const lastFileOnPageIndex =
    itemsCount > currentPage * maxItemsPerPage
      ? currentPage * maxItemsPerPage
      : itemsCount;

  const onPaginationButtonClick = useCallback(
    (pageNb: number) => {
      setCurrentPage(pageNb);
      onButtonClick(pageNb);
    },
    [onButtonClick, setCurrentPage]
  );

  const pageButtons: React.ReactNode[] = getPageButtons(
    currentPage,
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
          disabled={currentPage === 1 ? true : false}
          icon={ChevronLeftIcon}
          onClick={() => {
            onPaginationButtonClick(currentPage - 1);
          }}
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
          disabled={currentPage === numPages ? true : false}
          icon={ChevronRightIcon}
          onClick={() => {
            onPaginationButtonClick(currentPage + 1);
          }}
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
          ? `${itemsCount} items`
          : `Showing ${firstFileOnPageIndex}-${lastFileOnPageIndex} of ${itemsCount} items`}
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
      {pageNumber}
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
    for (let i = 1; i <= totalPages; i++) {
      pagination.push(renderPageNumber(i, currentPage, onPageClick, size));
    }
    return pagination;
  }

  const remainingSlots = slots - 2; // slots excluding first and last page
  const halfSlots = Math.floor(remainingSlots / 2);

  // Ensure current page is within bounds
  currentPage = Math.max(1, Math.min(currentPage, totalPages));

  pagination.push(renderPageNumber(1, currentPage, onPageClick, size)); // Always show the first page

  // Determine the range of pages to display
  let start, end;
  if (currentPage <= halfSlots + 2) {
    start = 2;
    end = remainingSlots;
  } else if (currentPage >= totalPages - halfSlots - 1) {
    start = totalPages - remainingSlots + 1;
    end = totalPages - 1;
  } else {
    start = currentPage - halfSlots + 1;
    end = currentPage + halfSlots - 1;
  }

  // Add ellipsis if there is a gap between the first page and the start of the range
  if (start > 2) {
    pagination.push(renderEllipses(size));
  }

  // Add the range of pages
  for (let i = start; i <= end; i++) {
    pagination.push(renderPageNumber(i, currentPage, onPageClick, size));
  }

  // Add ellipsis if there is a gap between the end of the range and the last page
  if (end < totalPages - 1) {
    pagination.push(renderEllipses(size));
  }

  pagination.push(renderPageNumber(totalPages, currentPage, onPageClick, size)); // Always show the last page

  return pagination;
}
