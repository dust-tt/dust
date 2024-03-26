import { useCallback, useState } from "react";
import React from "react";

import { Button } from "./Button";

interface FilterChipsProps<T extends string> {
  filters: T[];
  onFilterClick: (filterName: T) => void;
  defaultFilter?: T;
}

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
    <div className="s-flex s-flex-row s-flex-wrap s-gap-2">
      {filters.map((filterName) => (
        <Button
          label={filterName}
          variant={selectedFilter === filterName ? "primary" : "tertiary"}
          key={filterName}
          size="xs"
          hasMagnifying={false}
          onClick={() => handleFilterClick(filterName)}
        />
      ))}
    </div>
  );
}
