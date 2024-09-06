import { PaginationState } from "@tanstack/react-table";
import { useState } from "react";
import React from "react";

import { Citation, CitationType } from "@sparkle/components/Citation";
import { Pagination } from "@sparkle/components/Pagination";
import { classNames } from "@sparkle/lib/utils";

interface CitationItem {
  description?: string;
  title: string;
  type: CitationType;
  href: string;
}

interface PaginatedCitationsGridProps {
  items: CitationItem[];
  maxItemsPerPage?: 6 | 9 | 12 | 15;
}

export function PaginatedCitationsGrid({
  items,
  maxItemsPerPage = 9,
}: PaginatedCitationsGridProps) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: maxItemsPerPage,
  });
  const cols = 3;
  const rows = Math.ceil(Math.min(maxItemsPerPage, items.length) / cols);

  if (items.length === 0) {
    return null;
  }

  const { pageIndex, pageSize } = pagination;
  // Calculate start index.
  const startIndex = pageIndex * pageSize;
  // Slice items for current page.
  const paginatedItems = items.slice(startIndex, startIndex + pageSize);

  return (
    <div className="s-flex s-w-full s-flex-col">
      <div
        className={classNames(
          "s-grid s-w-full s-gap-2 s-overflow-x-hidden s-py-1",
          `s-grid-cols-${cols}`,
          `s-grid-rows-${rows}`
        )}
      >
        {paginatedItems.map((d, idx) => {
          return (
            <Citation
              size="xs"
              sizing="fluid"
              key={idx}
              description={d.description}
              href={d.href}
              title={d.title}
              type={d.type}
            />
          );
        })}
      </div>

      <div
        className={classNames(
          "s-pt-3",
          items.length > maxItemsPerPage ? "s-visible" : "s-collapse"
        )}
      >
        <Pagination
          rowCount={items.length}
          pagination={pagination}
          setPagination={setPagination}
          size="xs"
          showDetails={false}
          showPageButtons={false}
        />
      </div>
    </div>
  );
}
