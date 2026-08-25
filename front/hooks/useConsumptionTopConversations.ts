import {
  getConsumptionAnalyticsUrl,
  useConsumptionQuery,
} from "@app/hooks/useConsumptionQuery";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import {
  DEFAULT_CONSUMPTION_PERIOD_DAYS,
  normalizedConsumptionFilter,
} from "@app/lib/analytics/consumption_period";
import type { ConsumptionBody } from "@app/lib/api/analytics/consumption/schema";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import type { GetConsumptionTopConversationsResponse } from "@app/lib/api/analytics/consumption/top_conversations";
import { emptyArray } from "@app/lib/swr/swr";

interface UseConsumptionTopConversationsParams {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  filter?: ConsumptionScopeFilter;
  disabled?: boolean;
}

export function useConsumptionTopConversations({
  workspaceId,
  period,
  filter,
  disabled,
}: UseConsumptionTopConversationsParams) {
  const url = getConsumptionAnalyticsUrl({
    workspaceId,
    personal: true,
    endpoint: "top-conversations",
  });
  const body: ConsumptionBody = {
    period: period.kind,
    days:
      period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
    filter: normalizedConsumptionFilter(filter),
  };
  const { data, error, isLoading } = useConsumptionQuery<
    ConsumptionBody,
    GetConsumptionTopConversationsResponse
  >({ url, body, disabled });

  return {
    conversations: data?.conversations ?? emptyArray(),
    isTopConversationsLoading: !error && isLoading,
    isTopConversationsError: error,
  };
}
