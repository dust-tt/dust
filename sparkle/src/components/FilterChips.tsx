import { assertNever } from "@sparkle/lib/utils";
import React, { useCallback, useState } from "react";
import { Button, type ButtonProps } from "./Button";

export const FILTER_CHIP_VARIANTS = ["primary", "secondary"] as const;
export type FilterChipVariant = (typeof FILTER_CHIP_VARIANTS)[number];

// `bg-selected` is the NavTabPill active token; hover/active are pinned so the chip stays put.
function selectedButtonProps(
  variant: FilterChipVariant
): Pick<ButtonProps, "variant" | "className"> {
  switch (variant) {
    case "primary":
      return { variant: "primary" };
    case "secondary":
      return {
        variant: "ghost",
        className: "bg-selected hover:bg-selected active:bg-selected",
      };
    default:
      return assertNever(variant);
  }
}

export interface FilterChipProps {
  /** Chip text; omit it (with an `icon`) for an icon-only chip. */
  label?: string;
  /** Leading icon component. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Whether this chip is selected. */
  isSelected?: boolean;
  /** Selected look: `primary` fills the chip, `secondary` uses the lighter selected background. */
  variant?: FilterChipVariant;
  /** Tooltip label; required for icon-only chips. */
  tooltip?: string;
  onClick?: () => void;
}

/**
 * A single filter chip whose selection is controlled by the caller. Selected
 * chips are `primary` (filled) or `secondary` (lighter background); unselected
 * chips are ghost. Sets `aria-pressed`.
 * @summary Controlled single filter chip.
 */
export function FilterChip({
  label,
  icon,
  isSelected = false,
  variant = "primary",
  tooltip,
  onClick,
}: FilterChipProps) {
  return (
    <Button
      size="xs"
      label={label}
      icon={icon}
      tooltip={tooltip}
      aria-pressed={isSelected}
      onClick={onClick}
      {...(isSelected ? selectedButtonProps(variant) : { variant: "ghost" })}
    />
  );
}

interface FilterChipsProps<T extends string> {
  /** Filter names, each rendered as a chip. */
  filters: T[];
  /** Called with the clicked filter's name; only fires when the selection changes. */
  onFilterClick: (filterName: T) => void;
  /** Filter preselected on mount (must be one of filters). */
  defaultFilter?: T;
  /** Selected look for every chip; see FilterChip. */
  variant?: FilterChipVariant;
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
  variant = "primary",
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
        <FilterChip
          key={filterName}
          label={filterName}
          isSelected={selectedFilter === filterName}
          variant={variant}
          onClick={() => handleFilterClick(filterName)}
        />
      ))}
    </div>
  );
}
