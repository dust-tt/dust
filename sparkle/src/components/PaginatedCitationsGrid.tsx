import { useState } from "react";
import React from "react";

import { CitationType } from "@sparkle/components/Citation";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Citation,
  IconButton,
} from "@sparkle/index";
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
  const rows = Math.ceil(maxItemsPerPage / cols);

  if (items.length === 0) {
    return null;
  }

  // Calculate start index.
  const startIndex = (currentPage - 1) * maxItemsPerPage;
  // Slice items for current page.
  const paginatedItems = items.slice(startIndex, startIndex + maxItemsPerPage);
  const totalPages = Math.ceil(items.length / maxItemsPerPage);

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
      <div className="s-mt-4 s-flex s-justify-end">
        <span>
          Page {currentPage} of {totalPages}
        </span>
        <IconButton
          icon={ChevronLeftIcon}
          onClick={() => setCurrentPage((prev) => Math.min(prev - 1, 1))}
          disabled={currentPage === 1}
          variant="primary"
          size="sm"
        />
        <IconButton
          icon={ChevronRightIcon}
          onClick={() =>
            setCurrentPage((prev) => Math.min(prev + 1, totalPages))
          }
          disabled={currentPage === totalPages}
          variant="primary"
          size="sm"
        />
      </div>
    </div>
  );
}
