import type { FilterSummary } from "@app/components/workspace/analytics/filterPanel/filterState";
import { Button, Chip } from "@dust-tt/sparkle";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
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

interface FilterSummaryChipsProps<Category extends string> {
  summaries: FilterSummary<Category>[];
  onClearCategory: (category: Category) => void;
  onClearAll: () => void;
}

export function FilterSummaryChips<Category extends string>({
  summaries,
  onClearCategory,
  onClearAll,
}: FilterSummaryChipsProps<Category>) {
  const shouldReduceMotion = useReducedMotion();
  const transition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.18, ease: "easeOut" as const };

  return (
    <AnimatePresence initial={false}>
      {summaries.length > 0 && (
        <m.div
          key="filter-summary-chips"
          initial={
            shouldReduceMotion ? false : { opacity: 0, scale: 0.98, y: -4 }
          }
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={
            shouldReduceMotion ? undefined : { opacity: 0, scale: 0.98, y: -4 }
          }
          transition={transition}
          className="mt-2 origin-top"
        >
          <div className="flex flex-wrap items-center gap-2">
            <AnimatePresence initial={false}>
              {summaries.map((summary) => (
                <m.div
                  key={summary.category}
                  layout={!shouldReduceMotion}
                  initial={
                    shouldReduceMotion ? false : { opacity: 0, scale: 0.96 }
                  }
                  animate={{ opacity: 1, scale: 1 }}
                  exit={
                    shouldReduceMotion ? undefined : { opacity: 0, scale: 0.96 }
                  }
                  transition={transition}
                  className="max-w-full"
                >
                  <Chip
                    size="xs"
                    color="highlight"
                    className="max-w-full"
                    onRemove={() => onClearCategory(summary.category)}
                  >
                    <SummaryLabel
                      categoryLabel={summary.categoryLabel}
                      options={summary.options}
                    />
                  </Chip>
                </m.div>
              ))}
            </AnimatePresence>
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
  );
}
