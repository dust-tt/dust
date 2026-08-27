import React, { useCallback, useState } from "react";

import { Button } from "./Button";

interface FilterChipsProps<T extends string> {
  /** Filter names, each rendered as a chip. */
  filters: T[];
  /** Called with the clicked filter's name; only fires when the selection changes. */
  onFilterClick: (filterName: T) => void;
  /** Filter preselected on mount (must be one of filters). Ignored if selectedFilter is set. */
  defaultFilter?: T;
  /** Drives the selection from outside instead of the component's own state. */
  selectedFilter?: T | null;
  /** Custom chip label; defaults to the filter name itself. */
  getLabel?: (filterName: T) => string;
  /** Optional per-filter count, rendered as a counter badge on the chip. */
  counts?: Partial<Record<T, number>>;
  size?: "xs" | "sm";
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
  selectedFilter: controlledSelectedFilter,
  getLabel,
  counts,
  size = "xs",
}: FilterChipsProps<T>) {
  const isControlled = controlledSelectedFilter !== undefined;

  const [uncontrolledSelectedFilter, setUncontrolledSelectedFilter] =
    useState<T | null>(
      defaultFilter && filters.includes(defaultFilter) ? defaultFilter : null
    );

  const selectedFilter = isControlled
    ? controlledSelectedFilter
    : uncontrolledSelectedFilter;

  const handleFilterClick = useCallback(
    (filterName: T) => {
      // Avoid unnecessary re-renders by only triggering event if filter has changed.
      if (filterName !== selectedFilter) {
        if (!isControlled) {
          setUncontrolledSelectedFilter(filterName);
        }
        onFilterClick(filterName);
      }
    },
    [isControlled, onFilterClick, selectedFilter]
  );

  return (
    <div className="flex flex-row flex-wrap gap-2">
      {filters.map((filterName) => {
        const count = counts?.[filterName];
        return (
          <Button
            label={getLabel ? getLabel(filterName) : filterName}
            variant={selectedFilter === filterName ? "primary" : "ghost"}
            key={filterName}
            size={size}
            isCounter={count !== undefined}
            counterValue={count !== undefined ? String(count) : undefined}
            aria-pressed={selectedFilter === filterName}
            onClick={() => handleFilterClick(filterName)}
          />
        );
      })}
    </div>
  );
}
