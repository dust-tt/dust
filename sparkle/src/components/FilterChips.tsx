/** biome-ignore-all lint/suspicious/noImportCycles: I'm too lazy to fix that now */

import React, { useState } from "react";

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

  const handleFilterClick = (filterName: T) => {
    if (filterName !== selectedFilter) {
      setSelectedFilter(filterName);
      onFilterClick(filterName);
    }
  };

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
