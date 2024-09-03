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
  const [currentPage, setCurrentPage] = useState(1);
  const cols = 3;
  const rows = Math.ceil(Math.min(maxItemsPerPage, items.length) / cols);

  if (items.length === 0) {
    return null;
  }

  // Calculate start index.
  const startIndex = (currentPage - 1) * maxItemsPerPage;
  // Slice items for current page.
  const paginatedItems = items.slice(startIndex, startIndex + maxItemsPerPage);

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
          itemsCount={items.length}
          maxItemsPerPage={maxItemsPerPage}
          size="xs"
          showDetails={false}
          showPageButtons={false}
          onButtonClick={(pageNb) => setCurrentPage(pageNb)}
        />
      </div>
    </div>
  );
}
