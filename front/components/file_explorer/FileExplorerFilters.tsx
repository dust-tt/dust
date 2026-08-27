import type { FileExplorerFilter } from "@app/components/file_explorer/types";
import { FilterChips } from "@dust-tt/sparkle";
import { useMemo } from "react";

const FILTER_LABELS: Record<FileExplorerFilter, string> = {
  all: "All",
  nodes: "Knowledge",
  tables: "Tables",
  frames: "Frames",
  texts: "Texts",
  folders: "Folders",
  images: "Images",
  code: "Code",
};

const FILTER_ORDER: FileExplorerFilter[] = [
  "all",
  "nodes",
  "tables",
  "frames",
  "texts",
  "folders",
  "images",
  "code",
];

interface FileExplorerFiltersProps {
  active: FileExplorerFilter;
  onActiveChange: (v: FileExplorerFilter) => void;
  counts: Partial<Record<FileExplorerFilter, number>>;
}

export function FileExplorerFilters({
  active,
  onActiveChange,
  counts,
}: FileExplorerFiltersProps) {
  // "All" stays pinned first. Remaining chips are sorted by count desc, ties broken by the
  // canonical order defined in FILTER_ORDER.
  const orderedFilters = useMemo(() => {
    const [allFilter, ...rest] = FILTER_ORDER;
    const visible = rest.filter((filter) => (counts[filter] ?? 0) > 0);
    visible.sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));

    return [allFilter, ...visible];
  }, [counts]);

  // "All" never shows a count, even if one is provided for it.
  const countsWithoutAll = useMemo(() => {
    const { all: _all, ...rest } = counts;
    return rest;
  }, [counts]);

  // If only one it's "All" so there's nothing to filter against.
  if (orderedFilters.length <= 1) {
    return null;
  }

  return (
    <div className="shrink-0">
      <FilterChips
        filters={orderedFilters}
        selectedFilter={active}
        onFilterClick={onActiveChange}
        getLabel={(filter) => FILTER_LABELS[filter]}
        counts={countsWithoutAll}
      />
    </div>
  );
}
