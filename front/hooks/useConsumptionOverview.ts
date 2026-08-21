import {
  getConsumptionAnalyticsUrl,
  useConsumptionQuery,
} from "@app/hooks/useConsumptionQuery";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import {
  DEFAULT_CONSUMPTION_PERIOD_DAYS,
  normalizedConsumptionFilter,
} from "@app/lib/analytics/consumption_period";
import type { GetConsumptionOverviewResponse } from "@app/lib/api/analytics/consumption/overview";
import type { ConsumptionBody } from "@app/lib/api/analytics/consumption/schema";
import type {
  ConsumptionAccessScope,
  ConsumptionScopeFilter,
} from "@app/lib/api/analytics/consumption/scope";

export interface UseConsumptionOverviewParams {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  filter?: ConsumptionScopeFilter;
  accessScope?: ConsumptionAccessScope;
  disabled?: boolean;
}

export function useConsumptionOverview({
  workspaceId,
  period,
  filter,
  accessScope,
  disabled,
}: UseConsumptionOverviewParams) {
  const url = getConsumptionAnalyticsUrl({
    workspaceId,
    accessScope,
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
