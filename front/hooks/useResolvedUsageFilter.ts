import type { UsageFilter } from "@app/components/workspace/analytics/usageFilter";
import {
  hasUnresolvedUsageFilterNames,
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
  analyticsScope?: ConsumptionAnalyticsScope;
}

interface UseResolvedUsageFilterResult {
  filter: UsageFilter;
  isFacetsLoading: boolean;
}

// A filter hydrated from the query string only carries ids, so its options
// start with the id as display name and without a picture. The facets already
// fetched by the filter panel carry the real labels.
export function useResolvedUsageFilter({
  workspaceId,
  period,
  filter,
  analyticsScope,
}: UseResolvedUsageFilterParams): UseResolvedUsageFilterResult {
  const { options: facetOptions, isFacetsLoading } = useConsumptionFacets({
    workspaceId,
    period,
    filter: toConsumptionScopeFilter(filter),
    analyticsScope,
    disabled: !hasUnresolvedUsageFilterNames(filter),
  });

  const resolved = useMemo(
    () => resolveUsageFilter(filter, facetOptions),
    [filter, facetOptions]
  );

  return { filter: resolved, isFacetsLoading };
}
