import { PaginationState } from "@tanstack/react-table";
import { useState } from "react";
import React from "react";

import {
  Citation,
  CitationDescription,
  CitationGrid,
  CitationIcons,
  CitationIndex,
  CitationTitle,
} from "@sparkle/components/Citation";
import { Pagination } from "@sparkle/components/Pagination";
import { classNames } from "@sparkle/lib/utils";

interface CitationItem {
  description?: string;
  title: string;
  icon: React.JSX.Element;
  href?: string;
}

interface PaginatedCitationsGridProps {
  items: CitationItem[];
  maxItemsPerPage?: 6 | 9 | 12 | 15;
}

export function PaginatedCitationsGrid({
  items,
  maxItemsPerPage = 12,
}: PaginatedCitationsGridProps) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: maxItemsPerPage,
  });

  if (items.length === 0) {
    return null;
  }

  const { pageIndex, pageSize } = pagination;
  const startIndex = pageIndex * pageSize;

  const paginatedItems = items.slice(startIndex, startIndex + pageSize);

  return (
    <div className="s-flex s-w-full s-flex-col">
      <CitationGrid>
        {paginatedItems.map((d, idx) => {
          return (
            <Citation href={d.href} variant="primary">
              <CitationIcons>
                <CitationIndex>{startIndex + idx + 1}</CitationIndex>
                {d.icon}
              </CitationIcons>
              <CitationTitle>{d.title}</CitationTitle>
              <CitationDescription>{d.description}</CitationDescription>
            </Citation>
          );
        })}
      </CitationGrid>

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
