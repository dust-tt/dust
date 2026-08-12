import { useConsumptionQuery } from "@app/hooks/useConsumptionQuery";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { normalizedConsumptionFilter } from "@app/lib/analytics/consumption_period";
import type { GetConsumptionOverviewResponse } from "@app/lib/api/analytics/consumption/overview";
import type { ConsumptionBody } from "@app/lib/api/analytics/consumption/schema";
import { DEFAULT_CONSUMPTION_PERIOD_DAYS } from "@app/lib/api/analytics/consumption/schema";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";

export function useConsumptionOverview({
  workspaceId,
  period,
  filter,
  disabled,
}: {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  filter?: ConsumptionScopeFilter;
  disabled?: boolean;
}) {
  const url = `/api/w/${workspaceId}/analytics/consumption/overview`;
  const body: ConsumptionBody = {
    period: period.kind,
    days:
      period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
    filter: normalizedConsumptionFilter(filter),
  };

  const { data, error, isValidating } = useConsumptionQuery<
    ConsumptionBody,
    GetConsumptionOverviewResponse
  >({ url, body, disabled });

  return {
    overview: data ?? null,
    isOverviewLoading: !error && !data && !disabled,
    isOverviewError: error,
    isOverviewValidating: isValidating,
  };
}
