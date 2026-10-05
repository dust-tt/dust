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
  /** Leading icon. */
  icon?: ButtonProps["icon"];
  /** Whether this chip is selected. */
  isSelected?: boolean;
  /** Selected look: `primary` fills the chip, `secondary` uses the lighter selected background. */
  variant?: FilterChipVariant;
  /** Tooltip label; required for icon-only chips. */
  tooltip?: string;
  /** When true, the chip cannot be selected. */
  disabled?: boolean;
  /** Called on click; the caller owns the selection and toggles it. For a non-interactive badge use Chip. */
  onClick: () => void;
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
  disabled = false,
  onClick,
}: FilterChipProps) {
  return (
    <Button
      size="xs"
      label={label}
      icon={icon}
      tooltip={tooltip}
      disabled={disabled}
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
  /** Filter preselected on mount (must be one of filters). Ignored when `selectedFilter` is set. */
  defaultFilter?: T;
  /** Controlled selection; when set, the parent owns the active chip. */
  selectedFilter?: T;
  /** Filters that cannot be selected (e.g. categories with no matching results). */
  disabledFilters?: readonly T[];
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
  selectedFilter: controlledSelectedFilter,
  disabledFilters,
  variant = "primary",
}: FilterChipsProps<T>) {
  const [uncontrolledSelectedFilter, setUncontrolledSelectedFilter] =
    useState<T | null>(
      defaultFilter && filters.includes(defaultFilter) ? defaultFilter : null
    );

  const selectedFilter =
    controlledSelectedFilter !== undefined
      ? controlledSelectedFilter
      : uncontrolledSelectedFilter;

  const handleFilterClick = useCallback(
    (filterName: T) => {
      if (disabledFilters?.includes(filterName)) {
        return;
      }
      // Avoid unnecessary re-renders by only triggering event if filter has changed.
      if (filterName !== selectedFilter) {
        if (controlledSelectedFilter === undefined) {
          setUncontrolledSelectedFilter(filterName);
        }
        onFilterClick(filterName);
      }
    },
    [controlledSelectedFilter, disabledFilters, onFilterClick, selectedFilter]
  );

  return (
    <div className="flex flex-row flex-wrap gap-2">
      {filters.map((filterName) => (
        <FilterChip
          key={filterName}
          label={filterName}
          isSelected={selectedFilter === filterName}
          disabled={disabledFilters?.includes(filterName) ?? false}
          variant={variant}
          onClick={() => handleFilterClick(filterName)}
        />
      ))}
    </div>
  );
}
