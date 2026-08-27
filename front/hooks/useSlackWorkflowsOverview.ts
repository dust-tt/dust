import { useConsumptionQuery } from "@app/hooks/useConsumptionQuery";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD_DAYS } from "@app/lib/analytics/consumption_period";
import type { ConsumptionPeriodBody } from "@app/lib/api/analytics/consumption/schema";
import type { GetSlackWorkflowsOverviewResponse } from "@app/lib/api/analytics/slack_workflows/overview";

export function useSlackWorkflowsOverview({
  workspaceId,
  period,
  disabled,
}: {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  disabled?: boolean;
}) {
  const url = `/api/w/${workspaceId}/slack-workflows/overview`;
  const body: ConsumptionPeriodBody = {
    period: period.kind,
    days:
      period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
  };

  const { data, error, isLoading, isValidating } = useConsumptionQuery<
    ConsumptionPeriodBody,
    GetSlackWorkflowsOverviewResponse
  >({ url, body, disabled });

  return {
    overview: data ?? null,
    isOverviewLoading: !error && isLoading,
    isOverviewError: error,
    isOverviewValidating: isValidating,
  };
}
