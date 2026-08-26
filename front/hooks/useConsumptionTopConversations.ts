import {
  getConsumptionAnalyticsUrl,
  useConsumptionQuery,
} from "@app/hooks/useConsumptionQuery";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import {
  DEFAULT_CONSUMPTION_PERIOD_DAYS,
  normalizedConsumptionFilter,
} from "@app/lib/analytics/consumption_period";
import { PERSONAL_CONSUMPTION_ANALYTICS_SCOPE } from "@app/lib/analytics/consumption_scope";
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
    analyticsScope: PERSONAL_CONSUMPTION_ANALYTICS_SCOPE,
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
