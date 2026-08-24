import { useConsumptionQuery } from "@app/hooks/useConsumptionQuery";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD_DAYS } from "@app/lib/analytics/consumption_period";
import type {
  UserAutomationTriggersBody,
  UserAutomationTriggersFilter,
} from "@app/lib/api/analytics/automations/schema";
import type { AutomationTriggerRow } from "@app/lib/api/analytics/automations/triggers";
import type { UserAutomationTriggers } from "@app/lib/api/analytics/automations/user_triggers";
import { emptyArray } from "@app/lib/swr/swr";

export function useUserAutomationsTriggers({
  workspaceId,
  period,
  limit,
  offset = 0,
  search,
  filter,
  disabled,
}: {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  limit: number;
  offset?: number;
  search?: string;
  filter?: UserAutomationTriggersFilter;
  disabled?: boolean;
}) {
  const url = `/api/w/${workspaceId}/me/analytics/automations/triggers`;
  const body: UserAutomationTriggersBody = {
    period: period.kind,
    days:
      period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
    limit,
    offset,
    search: search?.trim(),
    filter,
  };

  const { data, error, mutate, isLoading, isValidating } = useConsumptionQuery<
    UserAutomationTriggersBody,
    UserAutomationTriggers
  >({ url, body, disabled });

  return {
    triggers: data?.triggers ?? emptyArray<AutomationTriggerRow>(),
    agents:
      data?.agents ?? emptyArray<UserAutomationTriggers["agents"][number]>(),
    totalCount: data?.totalCount ?? 0,
    medianRunCount: data?.medianRunCount ?? 0,
    medianCostPerRun: data?.medianCostPerRun ?? 0,
    isConsumptionAvailable: data?.isConsumptionAvailable ?? true,
    mutateTriggers: mutate,
    isTriggersLoading: !error && isLoading,
    isTriggersError: error,
    isTriggersValidating: isValidating,
  };
}
