import React, { useCallback, useState } from "react";

import { Button } from "./Button";

interface FilterChipsProps<T extends string> {
  filters: T[];
  onFilterClick: (filterName: T) => void;
  defaultFilter?: T;
  /** When set, selection is controlled by the parent. */
  selectedFilter?: T;
}

export function FilterChips<T extends string>({
  filters,
  onFilterClick,
  defaultFilter,
  selectedFilter: selectedFilterControlled,
}: FilterChipsProps<T>) {
  const [selectedFilterInternal, setSelectedFilterInternal] =
    useState<T | null>(
      defaultFilter && filters.includes(defaultFilter) ? defaultFilter : null
    );

  const selectedFilter =
    selectedFilterControlled !== undefined
      ? selectedFilterControlled
      : selectedFilterInternal;

  const handleFilterClick = useCallback(
    (filterName: T) => {
      if (filterName !== selectedFilter) {
        if (selectedFilterControlled === undefined) {
          setSelectedFilterInternal(filterName);
        }
        onFilterClick(filterName);
      }
    },
    [onFilterClick, selectedFilter, selectedFilterControlled]
  );

  return (
    <div className="s-flex s-flex-row s-flex-wrap s-gap-2">
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
