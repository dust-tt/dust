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

// A filter hydrated from the query string only carries ids, so its options
// start with the id as display name and without a picture. The facets already
// fetched by the filter panel carry the real labels.
export function useResolvedUsageFilter({
  workspaceId,
  period,
  filter,
  analyticsScope,
}: UseResolvedUsageFilterParams): UsageFilter {
  const { options: facetOptions } = useConsumptionFacets({
    workspaceId,
    period,
    filter: toConsumptionScopeFilter(filter),
    analyticsScope,
    disabled: !hasUnresolvedUsageFilterNames(filter),
  });

  return useMemo(
    () => resolveUsageFilter(filter, facetOptions),
    [filter, facetOptions]
  );
}
