import { ChevronLeftIcon, ChevronRightIcon } from "@dust-tt/sparkle";
import Link from "next/link";

type PageNumber = number | "ellipsis-start" | "ellipsis-end";

function getPageNumbers(currentPage: number, totalPages: number): PageNumber[] {
  const pages: PageNumber[] = [];
  const showEllipsisStart = currentPage > 3;
  const showEllipsisEnd = currentPage < totalPages - 2;

  // Always show first page
  pages.push(1);

  if (showEllipsisStart) {
    pages.push("ellipsis-start");
  }

  // Show pages around current
  for (
    let i = Math.max(2, currentPage - 1);
    i <= Math.min(totalPages - 1, currentPage + 1);
    i++
  ) {
    if (!pages.includes(i)) {
      pages.push(i);
    }
  }

  if (showEllipsisEnd) {
    pages.push("ellipsis-end");
  }

  // Always show last page if more than 1 page
  if (totalPages > 1 && !pages.includes(totalPages)) {
    pages.push(totalPages);
  }

  return pages;
}

interface PaginationLinkProps {
  page: number;
  isCurrent: boolean;
  buildPageUrl: (page: number) => string;
}

function PaginationLink({
  page,
  isCurrent,
  buildPageUrl,
}: PaginationLinkProps) {
  const href = buildPageUrl(page);

  if (isCurrent) {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-100 text-xs font-medium text-primary-800">
        {page}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-medium text-muted-foreground transition-colors hover:bg-gray-100 hover:text-foreground"
    >
      {page}
    </Link>
  );
}

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  rowCount: number;
  pageSize: number;
  buildPageUrl: (page: number) => string;
}

export function Pagination({
  currentPage,
  totalPages,
  rowCount,
  pageSize,
  buildPageUrl,
}: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, rowCount);

  const pageNumbers = getPageNumbers(currentPage, totalPages);
  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  return (
    <nav
      className="flex w-full items-center justify-between"
      aria-label="Pagination"
    >
      <div className="flex items-center gap-1">
        <Link
          href={canGoPrev ? buildPageUrl(currentPage - 1) : "#"}
          className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
            canGoPrev
              ? "text-muted-foreground hover:bg-gray-100 hover:text-foreground"
              : "pointer-events-none text-gray-300"
          }`}
          aria-disabled={!canGoPrev}
          tabIndex={canGoPrev ? undefined : -1}
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </Link>

        {pageNumbers.map((pageNum) =>
          pageNum === "ellipsis-start" || pageNum === "ellipsis-end" ? (
            <span
              key={pageNum}
              className="flex h-7 w-7 items-center justify-center text-xs text-muted-foreground"
            >
              ...
            </span>
          ) : (
            <PaginationLink
              key={pageNum}
              page={pageNum}
              isCurrent={pageNum === currentPage}
              buildPageUrl={buildPageUrl}
            />
          )
        )}

        <Link
          href={canGoNext ? buildPageUrl(currentPage + 1) : "#"}
          className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
            canGoNext
              ? "text-muted-foreground hover:bg-gray-100 hover:text-foreground"
              : "pointer-events-none text-gray-300"
          }`}
          aria-disabled={!canGoNext}
          tabIndex={canGoNext ? undefined : -1}
        >
          <ChevronRightIcon className="h-4 w-4" />
        </Link>
      </div>

      <span className="text-xs text-muted-foreground">
        {startItem}-{endItem} of {rowCount}
      </span>
    </nav>
  );
}
