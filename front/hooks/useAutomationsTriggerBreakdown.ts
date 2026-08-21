import { useConsumptionQuery } from "@app/hooks/useConsumptionQuery";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD_DAYS } from "@app/lib/analytics/consumption_period";
import type { GetAutomationTriggerBreakdownResponse } from "@app/lib/api/analytics/automations/breakdown";
import type { AutomationTriggerBreakdownBody } from "@app/lib/api/analytics/automations/schema";

// A workspace-scoped breakdown reads the manager-only analytics endpoint; a
// user-scoped one reads its own automations, whatever the caller's role.
export type AutomationsScope = "workspace" | "user";

export function useAutomationsTriggerBreakdown({
  workspaceId,
  triggerId,
  period,
  scope,
  disabled,
}: {
  workspaceId: string;
  triggerId: string;
  period: ConsumptionPeriodSelection;
  scope: AutomationsScope;
  disabled?: boolean;
}) {
  const url =
    scope === "user"
      ? `/api/w/${workspaceId}/me/automations/trigger-breakdown`
      : `/api/w/${workspaceId}/analytics/automations/trigger-breakdown`;
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
