import { useConsumptionQuery } from "@app/hooks/useConsumptionQuery";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD_DAYS } from "@app/lib/analytics/consumption_period";
import type { AutomationTriggersBody } from "@app/lib/api/analytics/automations/schema";
import type {
  AutomationTriggerRow,
  GetAutomationTriggersResponse,
} from "@app/lib/api/analytics/automations/triggers";
import type { PokeListTriggers } from "@app/lib/api/poke/triggers";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { PokeGetWebhookRequestsResponseBody } from "@app/types/api/poke/triggers";
import type { WebhookRequestTriggerStatus } from "@app/types/assistant/triggers";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

const pokeTriggersUrl = (workspaceId: string) =>
  `/api/poke/workspaces/${workspaceId}/triggers`;

export function usePokeTriggers({
  disabled,
  owner,
}: PokeConditionalFetchProps) {
  const { fetcher } = useFetcher();
  const triggersFetcher: Fetcher<PokeListTriggers> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    pokeTriggersUrl(owner.sId),
    triggersFetcher,
    { disabled }
  );

  return {
    data: data?.triggers ?? [],
    isLoading: !disabled && !error && !data,
    isError: error,
    mutate,
  };
}

export function usePokeAutomationTriggers({
  owner,
  period,
  limit,
  offset = 0,
  search,
  disabled,
}: {
  owner: LightWorkspaceType;
  period: ConsumptionPeriodSelection;
  limit: number;
  offset?: number;
  search?: string;
  disabled?: boolean;
}) {
  const url = `${pokeTriggersUrl(owner.sId)}/search`;
  const body: Omit<AutomationTriggersBody, "format"> = {
    period: period.kind,
    days:
      period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
    limit,
    offset,
    search: search?.trim(),
  };

  const { data, error, mutate, isLoading } = useConsumptionQuery<
    Omit<AutomationTriggersBody, "format">,
    GetAutomationTriggersResponse
  >({ url, body, disabled });

  return {
    triggers: data?.triggers ?? emptyArray<AutomationTriggerRow>(),
    totalCount: data?.totalCount ?? 0,
    isTriggersLoading: !error && isLoading,
    isTriggersError: error,
    mutateTriggers: mutate,
  };
}

export function usePokeWebhookRequests({
  owner,
  triggerId,
  limit,
  status,
  disabled,
}: {
  owner: LightWorkspaceType;
  triggerId: string;
  limit?: number;
  status?: WebhookRequestTriggerStatus;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const requestsFetcher: Fetcher<PokeGetWebhookRequestsResponseBody> = fetcher;
  const params = new URLSearchParams();
  if (limit !== undefined) {
    params.set("limit", limit.toString());
  }
  if (status) {
    params.set("status", status);
  }
  const query = params.toString();
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/triggers/${triggerId}/webhook_requests${query ? `?${query}` : ""}`,
    requestsFetcher,
    { disabled }
  );

  return {
    webhookRequests: data?.requests ?? [],
    isWebhookRequestsLoading: !error && !data,
    isWebhookRequestsError: error,
    mutateWebhookRequests: mutate,
  };
}
