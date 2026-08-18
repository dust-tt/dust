import { useConsumptionQuery } from "@app/hooks/useConsumptionQuery";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD_DAYS } from "@app/lib/analytics/consumption_period";
import type { GetAutomationsOverviewResponse } from "@app/lib/api/analytics/automations/overview";
import type { AutomationsOverviewBody } from "@app/lib/api/analytics/automations/schema";

export function useAutomationsOverview({
  workspaceId,
  period,
  disabled,
}: {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  disabled?: boolean;
}) {
  const url = `/api/w/${workspaceId}/analytics/automations/overview`;
  const body: AutomationsOverviewBody = {
    period: period.kind,
    days:
      period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
  };

  const { data, error, isLoading, isValidating } = useConsumptionQuery<
    AutomationsOverviewBody,
    GetAutomationsOverviewResponse
  >({ url, body, disabled });

  return {
    overview: data ?? null,
    isOverviewLoading: !error && isLoading,
    isOverviewError: error,
    isOverviewValidating: isValidating,
  };
}
