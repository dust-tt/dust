import { useConsumptionQuery } from "@app/hooks/useConsumptionQuery";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD_DAYS } from "@app/lib/analytics/consumption_period";
import type { AutomationTriggersBody } from "@app/lib/api/analytics/automations/schema";
import type {
  AutomationTriggerRow,
  GetAutomationTriggersResponse,
} from "@app/lib/api/analytics/automations/triggers";
import { emptyArray } from "@app/lib/swr/swr";

export function useAutomationsTriggers({
  workspaceId,
  period,
  limit,
  offset = 0,
  disabled,
}: {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  limit: number;
  offset?: number;
  disabled?: boolean;
}) {
  const url = `/api/w/${workspaceId}/analytics/automations/triggers`;
  const body: AutomationTriggersBody = {
    period: period.kind,
    days:
      period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
    limit,
    offset,
  };

  const { data, error, isLoading, isValidating } = useConsumptionQuery<
    AutomationTriggersBody,
    GetAutomationTriggersResponse
  >({ url, body, disabled });

  return {
    triggers: data?.triggers ?? emptyArray<AutomationTriggerRow>(),
    totalCount: data?.totalCount ?? 0,
    isTriggersLoading: !error && isLoading,
    isTriggersError: error,
    isTriggersValidating: isValidating,
  };
}
