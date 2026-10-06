import { FilterSummaryChips } from "@app/components/shared/filter_panel/FilterSummaryChips";
import type {
  UsageFilter,
  UsageFilterCategory,
} from "@app/components/workspace/analytics/usageFilter";
import {
  clearUsageFilterCategory,
  getUsageFilterSummaries,
} from "@app/components/workspace/analytics/usageFilter";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";

const CATEGORY_LABEL: Record<UsageFilterCategory, MessageDescriptor> = {
  agent: msg`Agent`,
  member: msg`Member`,
  group: msg`Group`,
  model: msg`Model`,
  tool: msg`Tool`,
  skill: msg`Skill`,
  source: msg`Source`,
  trigger: msg`Trigger`,
  api_key: msg`API key`,
};

interface UsageFilterSummaryProps {
  filter: UsageFilter;
  onFilterChange: (filter: UsageFilter) => void;
}

export function UsageFilterSummary({
  filter,
  onFilterChange,
}: UsageFilterSummaryProps) {
  const { t } = useLingui();
  const categoryLabels = useMemo<Record<UsageFilterCategory, string>>(
    () => ({
      agent: t(CATEGORY_LABEL.agent),
      member: t(CATEGORY_LABEL.member),
      group: t(CATEGORY_LABEL.group),
      model: t(CATEGORY_LABEL.model),
      tool: t(CATEGORY_LABEL.tool),
      skill: t(CATEGORY_LABEL.skill),
      source: t(CATEGORY_LABEL.source),
      trigger: t(CATEGORY_LABEL.trigger),
      api_key: t(CATEGORY_LABEL.api_key),
    }),
    [t]
  );
  return (
    <FilterSummaryChips
      summaries={getUsageFilterSummaries(filter, categoryLabels)}
      onClearCategory={(category) =>
        onFilterChange(clearUsageFilterCategory(filter, category))
      }
      onClearAll={() => onFilterChange({})}
    />
  );
}
