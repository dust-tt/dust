import type {
  UsageFilter,
  UsageFilterSummary as UsageFilterSummaryType,
} from "@app/components/workspace/analytics/usageFilter";
import {
  clearUsageFilterCategory,
  getUsageFilterSummaries,
} from "@app/components/workspace/analytics/usageFilter";
import { Button, Chip } from "@dust-tt/sparkle";
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

  if (summaries.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {summaries.map((summary) => (
        <Chip
          key={summary.category}
          size="xs"
          color="highlight"
          className="max-w-full"
          onRemove={() =>
            onFilterChange(clearUsageFilterCategory(filter, summary.category))
          }
        >
          <SummaryLabel
            categoryLabel={summary.categoryLabel}
            options={summary.options}
          />
        </Chip>
      ))}
      <Button
        label="Clear all"
        size="xs"
        variant="ghost-secondary"
        onClick={() => onFilterChange({})}
      />
    </div>
  );
}
