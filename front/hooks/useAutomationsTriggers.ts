import { useConsumptionQuery } from "@app/hooks/useConsumptionQuery";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD_DAYS } from "@app/lib/analytics/consumption_period";
import type {
  AutomationTriggersBody,
  AutomationTriggersFilter,
} from "@app/lib/api/analytics/automations/schema";
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
  filter,
  disabled,
}: {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  limit: number;
  offset?: number;
  filter?: AutomationTriggersFilter;
  disabled?: boolean;
}) {
  const url = `/api/w/${workspaceId}/analytics/automations/triggers`;
  const body: AutomationTriggersBody = {
    period: period.kind,
    days:
      period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
    limit,
    offset,
    filter,
  };

  const { data, error, isLoading, isValidating } = useConsumptionQuery<
    AutomationTriggersBody,
    GetAutomationTriggersResponse
  >({ url, body, disabled });

  return {
    triggers: data?.triggers ?? emptyArray<AutomationTriggerRow>(),
    totalCount: data?.totalCount ?? 0,
    medianRunCount: data?.medianRunCount ?? 0,
    medianCostPerRun: data?.medianCostPerRun ?? 0,
    isTriggersLoading: !error && isLoading,
    isTriggersError: error,
    isTriggersValidating: isValidating,
  };
}
