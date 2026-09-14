import {
  Citation,
  CitationDescription,
  CitationGrid,
  CitationIcons,
  CitationIndex,
  CitationTitle,
} from "@sparkle/components/Citation";
import { Pagination } from "@sparkle/components/Pagination";
import { cn } from "@sparkle/lib/utils";
import type { PaginationState } from "@tanstack/react-table";
import React, { useState } from "react";

interface CitationItem {
  description?: string;
  title: string;
  icon: React.JSX.Element;
  href?: string;
}

interface PaginatedCitationsGridProps {
  /** The citations to display: title, icon, and optional description/href per item. */
  items: CitationItem[];
  /** Page size; pagination controls only appear when items exceed it. */
  maxItemsPerPage?: 6 | 9 | 12 | 15;
}

/**
 * A paginated grid of link citations for when an agent answer references many
 * sources, automatically paging through large sets while staying compact for
 * a handful of items. Use it for sizeable, homogeneous link lists; for a few
 * rich, individually composed references use Citation with CitationGrid.
 * @summary Paginated grid of source citations.
 */
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
    <div className="flex w-full flex-col">
      <CitationGrid>
        {paginatedItems.map((d, idx) => {
          return (
            <Citation href={d.href} variant="primary" key={idx}>
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
        className={cn(
          "pt-3",
          items.length > maxItemsPerPage ? "visible" : "collapse"
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
