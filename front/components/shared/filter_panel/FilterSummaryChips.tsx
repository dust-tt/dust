import type { FilterSummary } from "@app/components/shared/filter_panel/filterState";
import { Button, Chip, cn, LoadingBlock } from "@dust-tt/sparkle";
import {
  AnimatePresence,
  domMax,
  LazyMotion,
  m,
  useReducedMotion,
} from "framer-motion";
import type { ReactNode } from "react";
import { Fragment } from "react";

function SummaryLabel({
  categoryLabel,
  options,
}: Pick<FilterSummary<string>, "categoryLabel" | "options">) {
  return (
    <span className="min-w-0 truncate text-xs font-medium">
      <span className="font-bold">{categoryLabel}</span>
      <span> is </span>
      {options.map((option, index) => (
        <Fragment key={option.id}>
          {index > 0 && <span> or </span>}
          <span className="font-bold">{option.name}</span>
        </Fragment>
      ))}
    </span>
  );
}

interface FilterExtraChip {
  key: string;
  label: ReactNode;
  onRemove: () => void;
}

interface FilterSummaryChipsProps<Category extends string> {
  summaries: FilterSummary<Category>[];
  // Chips for settings outside the filter categories, shown after the category chips.
  extraChips?: FilterExtraChip[];
  onClearCategory: (category: Category) => void;
  onClearAll: () => void;
  isLoading?: boolean;
  className?: string;
}

export function FilterSummaryChips<Category extends string>({
  summaries,
  extraChips = [],
  onClearCategory,
  onClearAll,
  isLoading = false,
  className,
}: FilterSummaryChipsProps<Category>) {
  const chips: FilterExtraChip[] = [
    ...summaries.map((summary) => ({
      key: `category:${summary.category}`,
      label: (
        <SummaryLabel
          categoryLabel={summary.categoryLabel}
          options={summary.options}
        />
      ),
      onRemove: () => onClearCategory(summary.category),
    })),
    ...extraChips.map((chip) => ({ ...chip, key: `extra:${chip.key}` })),
  ];
  const shouldReduceMotion = useReducedMotion();
  const transition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.18, ease: "easeOut" as const };

  return (
    <LazyMotion features={domMax}>
      <AnimatePresence initial={false}>
        {chips.length > 0 && (
          <m.div
            key="filter-summary-chips"
            initial={
              shouldReduceMotion ? false : { opacity: 0, scale: 0.98, y: -4 }
            }
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={
              shouldReduceMotion
                ? undefined
                : { opacity: 0, scale: 0.98, y: -4 }
            }
            transition={transition}
            className={cn("origin-top", className)}
          >
            <div
              aria-busy={isLoading}
              className="flex flex-wrap items-center gap-2"
            >
              <AnimatePresence initial={false}>
                {chips.map((chip) => (
                  <m.div
                    key={chip.key}
                    layout={!shouldReduceMotion}
                    initial={
                      shouldReduceMotion ? false : { opacity: 0, scale: 0.96 }
                    }
                    animate={{ opacity: 1, scale: 1 }}
                    exit={
                      shouldReduceMotion
                        ? undefined
                        : { opacity: 0, scale: 0.96 }
                    }
                    transition={transition}
                    className="max-w-full"
                  >
                    <Chip
                      size="xs"
                      color="highlight"
                      className="max-w-full"
                      onRemove={chip.onRemove}
                    >
                      {chip.label}
                    </Chip>
                  </m.div>
                ))}
              </AnimatePresence>
              {isLoading && <LoadingBlock className="h-6 w-28 rounded-[9px]" />}
              <m.div layout={!shouldReduceMotion} transition={transition}>
                <Button
                  label="Clear all"
                  size="xs"
                  variant="ghost-secondary"
                  onClick={onClearAll}
                />
              </m.div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}
