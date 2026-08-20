import React, { useCallback, useState } from "react";

import { Button } from "./Button";

interface FilterChipsProps<T extends string> {
  /** Filter names, each rendered as a chip. */
  filters: T[];
  /** Called with the clicked filter's name; only fires when the selection changes. */
  onFilterClick: (filterName: T) => void;
  /** Filter preselected on mount (must be one of filters). */
  defaultFilter?: T;
}

/**
 * A horizontal row of single-select filter chips for narrowing a list or
 * collection to one category at a time, firing onFilterClick on selection.
 * Use it to let users switch between mutually exclusive views or categories
 * (e.g. "Featured", "Research").
 * @summary Single-select category filter chips.
 */
export function FilterChips<T extends string>({
  filters,
  onFilterClick,
  defaultFilter,
}: FilterChipsProps<T>) {
  const [selectedFilter, setSelectedFilter] = useState<T | null>(
    defaultFilter && filters.includes(defaultFilter) ? defaultFilter : null
  );

  const handleFilterClick = useCallback(
    (filterName: T) => {
      // Avoid unnecessary re-renders by only triggering event if filter has changed.
      if (filterName !== selectedFilter) {
        setSelectedFilter(filterName);
        onFilterClick(filterName);
      }
    },
    [onFilterClick, selectedFilter]
  );

  return (
    <div className="flex flex-row flex-wrap gap-2">
      {filters.map((filterName) => (
        <Button
          label={filterName}
          variant={selectedFilter === filterName ? "primary" : "ghost"}
          key={filterName}
          size="xs"
          onClick={() => handleFilterClick(filterName)}
        />
      ))}
    </div>
  );
}
