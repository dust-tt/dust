import { useConsumptionQuery } from "@app/hooks/useConsumptionQuery";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD_DAYS } from "@app/lib/analytics/consumption_period";
import type { GetAutomationTriggerBreakdownResponse } from "@app/lib/api/analytics/automations/breakdown";
import type { AutomationTriggerBreakdownBody } from "@app/lib/api/analytics/automations/schema";

export function useAutomationsTriggerBreakdown({
  workspaceId,
  triggerId,
  period,
  disabled,
}: {
  workspaceId: string;
  triggerId: string;
  period: ConsumptionPeriodSelection;
  disabled?: boolean;
}) {
  const url = `/api/w/${workspaceId}/analytics/automations/trigger-breakdown`;
  const body: AutomationTriggerBreakdownBody = {
    triggerId,
    period: period.kind,
    days:
      period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
  };

  const { data, error, isLoading, isValidating } = useConsumptionQuery<
    AutomationTriggerBreakdownBody,
    GetAutomationTriggerBreakdownResponse
  >({ url, body, disabled });

  return {
    creditDestination: data?.creditDestination ?? null,
    isBreakdownLoading: !error && isLoading,
    isBreakdownError: error,
    isBreakdownValidating: isValidating,
  };
}
