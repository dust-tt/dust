import {
  getConsumptionAnalyticsUrl,
  useConsumptionQuery,
} from "@app/hooks/useConsumptionQuery";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import {
  DEFAULT_CONSUMPTION_PERIOD,
  DEFAULT_CONSUMPTION_PERIOD_DAYS,
  normalizedConsumptionFilter,
} from "@app/lib/analytics/consumption_period";
import type { ConsumptionAnalyticsScope } from "@app/lib/analytics/consumption_scope";
import type { GetConsumptionOverviewResponse } from "@app/lib/api/analytics/consumption/overview";
import type { ConsumptionBody } from "@app/lib/api/analytics/consumption/schema";
import type { ConsumptionScopeFilter } from "@app/types/api/analytics/consumption";

export interface UseConsumptionOverviewParams {
  workspaceId: string;
  period?: ConsumptionPeriodSelection;
  filter?: ConsumptionScopeFilter;
  analyticsScope?: ConsumptionAnalyticsScope;
  disabled?: boolean;
}

export function useConsumptionOverview({
  workspaceId,
  period = DEFAULT_CONSUMPTION_PERIOD,
  filter,
  analyticsScope,
  disabled,
}: UseConsumptionOverviewParams) {
  const url = getConsumptionAnalyticsUrl({
    workspaceId,
    analyticsScope,
    endpoint: "overview",
  });
  const body: ConsumptionBody = {
    period: period.kind,
    days:
      period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
    filter: normalizedConsumptionFilter(filter),
  };

  const { data, error, isLoading, isValidating } = useConsumptionQuery<
    ConsumptionBody,
    GetConsumptionOverviewResponse
  >({ url, body, disabled });

  return {
    overview: data ?? null,
    isOverviewLoading: isLoading,
    isOverviewError: error,
    isOverviewValidating: isValidating,
  };
}
