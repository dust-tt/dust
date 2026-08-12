import type {
  UsageFilter,
  UsageFilterSummary as UsageFilterSummaryType,
} from "@app/components/workspace/analytics/usageFilter";
import {
  clearUsageFilterCategory,
  getUsageFilterSummaries,
} from "@app/components/workspace/analytics/usageFilter";
import { Button, Chip } from "@dust-tt/sparkle";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Fragment } from "react";

interface UsageFilterSummaryProps {
  filter: UsageFilter;
  onFilterChange: (filter: UsageFilter) => void;
}

function SummaryLabel({
  categoryLabel,
  options,
}: Pick<UsageFilterSummaryType, "categoryLabel" | "options">) {
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

export function UsageFilterSummary({
  filter,
  onFilterChange,
}: UsageFilterSummaryProps) {
  const summaries = getUsageFilterSummaries(filter);
  const shouldReduceMotion = useReducedMotion();
  const transition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.18, ease: "easeOut" as const };

  return (
    <AnimatePresence initial={false}>
      {summaries.length > 0 && (
        <motion.div
          key="usage-filter-summary"
          initial={
            shouldReduceMotion ? false : { height: 0, marginTop: 0, opacity: 0 }
          }
          animate={{ height: "auto", marginTop: 8, opacity: 1 }}
          exit={
            shouldReduceMotion
              ? undefined
              : { height: 0, marginTop: 0, opacity: 0 }
          }
          transition={transition}
          className="overflow-hidden"
        >
          <div className="flex flex-wrap items-center gap-2">
            <AnimatePresence initial={false}>
              {summaries.map((summary) => (
                <motion.div
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
                    onRemove={() =>
                      onFilterChange(
                        clearUsageFilterCategory(filter, summary.category)
                      )
                    }
                  >
                    <SummaryLabel
                      categoryLabel={summary.categoryLabel}
                      options={summary.options}
                    />
                  </Chip>
                </motion.div>
              ))}
            </AnimatePresence>
            <motion.div layout={!shouldReduceMotion} transition={transition}>
              <Button
                label="Clear all"
                size="xs"
                variant="ghost-secondary"
                onClick={() => onFilterChange({})}
              />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
