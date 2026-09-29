import type {
  UsageFilter,
  UsageFilterOption,
} from "@app/components/workspace/analytics/usageFilter";
import {
  getUsageFilterOptions,
  resolveUsageFilter,
  toConsumptionScopeFilter,
} from "@app/components/workspace/analytics/usageFilter";
import { useConsumptionFacets } from "@app/hooks/useConsumptionFacets";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import type { ConsumptionAnalyticsScope } from "@app/lib/analytics/consumption_scope";
import { useMemo } from "react";

interface UseResolvedUsageFilterParams {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  filter: UsageFilter;
  restoredOptions: ReadonlySet<UsageFilterOption>;
  analyticsScope?: ConsumptionAnalyticsScope;
}

interface UseResolvedUsageFilterResult {
  filter: UsageFilter;
  isFacetsLoading: boolean;
}

// A filter restored from the URL hash only carries ids and labels, so its
// options start with the stored label and without a picture. The facets already
// fetched by the filter panel carry the current labels.
/**
 * @cc [owner:tdraier,label:react;performance] resolve-restored-options-only
 * The facet lookup MUST run while `filter` holds any option of `restoredOptions` (compared by
 * identity) and MUST NOT run otherwise. Selected options missing from the facets MUST keep their
 * stored label.
 */
export function useResolvedUsageFilter({
  workspaceId,
  period,
  filter,
  restoredOptions,
  analyticsScope,
}: UseResolvedUsageFilterParams): UseResolvedUsageFilterResult {
  const { options: facetOptions, isFacetsLoading } = useConsumptionFacets({
    workspaceId,
    period,
    filter: toConsumptionScopeFilter(filter),
    analyticsScope,
    disabled: !getUsageFilterOptions(filter).some((option) =>
      restoredOptions.has(option)
    ),
  });

  const resolved = useMemo(
    () => resolveUsageFilter(filter, facetOptions),
    [filter, facetOptions]
  );

  return { filter: resolved, isFacetsLoading };
}
