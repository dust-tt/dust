import { useConsumptionQuery } from "@app/hooks/useConsumptionQuery";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD_DAYS } from "@app/lib/analytics/consumption_period";
import type { ConsumptionTopBody } from "@app/lib/api/analytics/consumption/schema";
import type {
  ConsumptionTopApiKeyRow,
  GetConsumptionTopApiKeysResponse,
} from "@app/lib/api/analytics/consumption/top_api_keys";
import { emptyArray } from "@app/lib/swr/swr";

export function useAutomationsApiKeys({
  workspaceId,
  period,
  limit,
  offset = 0,
  search,
  disabled,
}: {
  workspaceId: string;
  period: ConsumptionPeriodSelection;
  limit: number;
  offset?: number;
  search?: string;
  disabled?: boolean;
}) {
  const url = `/api/w/${workspaceId}/analytics/consumption/top-api-keys`;
  const body: ConsumptionTopBody = {
    period: period.kind,
    days:
      period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
    limit,
    offset,
    search: search?.trim(),
  };

  const { data, error, isLoading, isValidating } = useConsumptionQuery<
    ConsumptionTopBody,
    GetConsumptionTopApiKeysResponse
  >({ url, body, disabled });

  return {
    apiKeys: data?.apiKeys ?? emptyArray<ConsumptionTopApiKeyRow>(),
    totalCredits: data?.totalCredits ?? 0,
    totalCount: data?.totalCount ?? 0,
    isApiKeysLoading: !error && isLoading,
    isApiKeysError: error,
    isApiKeysValidating: isValidating,
  };
}
