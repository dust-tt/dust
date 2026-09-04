import { cn } from "@sparkle/lib/utils";
import React, { useCallback, useMemo, useState } from "react";

import { Button, type ButtonIconType, type ButtonVariantType } from "./Button";

export const FILTER_CHIP_VARIANTS = ["primary", "secondary"] as const;
export type FilterChipVariantType = (typeof FILTER_CHIP_VARIANTS)[number];

/** An icon (a component or an element), or a run of text. */
export type FilterChipSlotType = ButtonIconType | string;

export interface FilterChipType<T extends string = string> {
  /** Identity of the chip, passed back to `onFilterClick`. */
  value: T;
  /** Chip text. Defaults to `value`. */
  label?: string;
  /** Rendered before the label. */
  startSlot?: FilterChipSlotType;
  /** Rendered after the label. */
  endSlot?: FilterChipSlotType;
}

// `hover:`/`active:` repeat the overlay so it holds while the pointer is on a
// selected chip, and the `dark:` pair beats `ghost`'s own lighten-on-hover.
// `Button` merges this after its variant classes, so twMerge lets each modifier
// win over the matching one from `ghost`.
const SECONDARY_SELECTED = cn(
  "bg-foreground/[0.06]",
  "hover:bg-foreground/[0.06] active:bg-foreground/[0.06]",
  "dark:hover:bg-foreground/[0.06] dark:active:bg-foreground/[0.06]"
);

interface ChipLook {
  buttonVariant: ButtonVariantType;
  /** Layered on top of the `Button` variant. */
  className?: string;
  /** Colour for a text slot against this look. */
  slotTextColor: string;
}

/**
 * Every look, keyed by variant then selection — so a new variant is a compile
 * error until both of its states are filled in.
 *
 * `secondary`'s selected state is a flat 6% foreground overlay: the
 * `transparency-selected` token `OptionCard` uses for its selected row.
 *
 * Slot text is muted on a ghost chip, but the selected `primary` chip is a dark
 * surface, so there it tracks the label token at 60% — the same treatment
 * `Button` gives its own chevron, and it flips correctly in dark mode.
 */
const CHIP_LOOKS: Record<
  FilterChipVariantType,
  Record<"selected" | "idle", ChipLook>
> = {
  primary: {
    selected: {
      buttonVariant: "primary",
      slotTextColor: "text-primary-50/60",
    },
    idle: { buttonVariant: "ghost", slotTextColor: "text-muted-foreground" },
  },
  secondary: {
    selected: {
      buttonVariant: "ghost",
      className: SECONDARY_SELECTED,
      slotTextColor: "text-muted-foreground",
    },
    idle: { buttonVariant: "ghost", slotTextColor: "text-muted-foreground" },
  },
};

function renderSlot(
  slot: FilterChipSlotType | undefined,
  slotTextColor: string
): ButtonIconType | undefined {
  if (slot === undefined) {
    return undefined;
  }
  if (typeof slot === "string") {
    return <span className={cn("copy-xs", slotTextColor)}>{slot}</span>;
  }
  return slot;
}

function normalizeFilter<T extends string>(
  filter: T | FilterChipType<T>
): FilterChipType<T> {
  return typeof filter === "string" ? { value: filter } : filter;
}

interface FilterChipsProps<T extends string> {
  /** Plain filter names, or descriptors carrying a label and slots. */
  filters: readonly (T | FilterChipType<T>)[];
  /** Called with the clicked filter's name, or `null` when the click cleared it. */
  onFilterClick: (filterName: T | null) => void;
  /** Filter preselected on mount (must be one of filters). Ignored when `selectedFilter` is passed. */
  defaultFilter?: T;
  /** The lit chip. Passing it — including as `null` — makes the row controlled. */
  selectedFilter?: T | null;
  /** Whether clicking the lit chip clears the selection. Defaults to true. */
  allowDeselect?: boolean;
  /** `primary` fills solid when selected; `secondary` takes a flat overlay. */
  variant?: FilterChipVariantType;
  className?: string;
}

/**
 * A horizontal row of single-select filter chips for narrowing a list or
 * collection to one category at a time, firing onFilterClick on selection.
 * Use it to let users switch between mutually exclusive views or categories
 * (e.g. "Featured", "Research").
 *
 * Chips can carry a startSlot and an endSlot — an icon, or a string that
 * renders in smaller muted type for a readout such as a `3/5` progress count.
 * Use variant "secondary" where a solid selected chip would read as the
 * surface's primary action, such as a bar sitting above content.
 *
 * Selection is uncontrolled by default; pass selectedFilter to drive it from
 * state you already own, such as which side panel is open. Clicking the lit
 * chip clears the selection and reports null, so a row of categories with no
 * "All" among them can still get back to the unfiltered list — pass
 * allowDeselect={false} for rows that carry their own neutral chip.
 * @summary Single-select category filter chips.
 */
export function FilterChips<T extends string>({
  filters,
  onFilterClick,
  defaultFilter,
  selectedFilter,
  allowDeselect = true,
  variant = "primary",
  className,
}: FilterChipsProps<T>) {
  const chips = useMemo(() => filters.map(normalizeFilter), [filters]);

  // `undefined` means the caller is not controlling the row; `null` is a
  // caller-controlled empty selection, so the two cannot be collapsed.
  const isControlled = selectedFilter !== undefined;

  const [internalFilter, setInternalFilter] = useState<T | null>(
    defaultFilter && chips.some((chip) => chip.value === defaultFilter)
      ? defaultFilter
      : null
  );
  const activeFilter = isControlled ? selectedFilter : internalFilter;

  const handleFilterClick = useCallback(
    (filterName: T) => {
      const nextFilter =
        allowDeselect && filterName === activeFilter ? null : filterName;

      // Re-clicking the lit chip with deselection off changes nothing, so skip
      // the state write and the callback rather than re-render for no reason.
      if (nextFilter === activeFilter) {
        return;
      }
      if (!isControlled) {
        setInternalFilter(nextFilter);
      }
      onFilterClick(nextFilter);
    },
    [activeFilter, allowDeselect, isControlled, onFilterClick]
  );

  return (
    <div className={cn("flex flex-row flex-wrap gap-2", className)}>
      {chips.map(({ value, label, startSlot, endSlot }) => {
        const isSelected = activeFilter === value;
        const look = CHIP_LOOKS[variant][isSelected ? "selected" : "idle"];

        return (
          <Button
            key={value}
            size="xs"
            variant={look.buttonVariant}
            className={look.className}
            icon={renderSlot(startSlot, look.slotTextColor)}
            label={label ?? value}
            iconRight={renderSlot(endSlot, look.slotTextColor)}
            aria-pressed={isSelected}
            onClick={() => handleFilterClick(value)}
          />
        );
      })}
    </div>
  );
}
