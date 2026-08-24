import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD_DAYS } from "@app/lib/analytics/consumption_period";
import type {
  PokeListTriggers,
  PokeTriggerOrderColumn,
  PokeTriggerProviderFilter,
  PokeTriggerSearchBody,
  PokeTriggerSearchResponse,
  PokeTriggerSearchRow,
} from "@app/lib/api/poke/triggers";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { PokeGetWebhookRequestsResponseBody } from "@app/types/api/poke/triggers";
import type { WebhookRequestTriggerStatus } from "@app/types/assistant/triggers";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";
import { mutate as globalMutate } from "swr";

const pokeTriggersUrl = (workspaceId: string) =>
  `/api/poke/workspaces/${workspaceId}/triggers`;

export async function clearPokeTriggerCaches(owner: LightWorkspaceType) {
  const triggersUrl = pokeTriggersUrl(owner.sId);
  const searchUrl = `${triggersUrl}/search`;

  await globalMutate(
    (key) =>
      key === triggersUrl || (Array.isArray(key) && key[0] === searchUrl),
    undefined,
    { revalidate: false }
  );
}

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

export function usePokeTriggerSearch({
  owner,
  period,
  limit,
  offset,
  search,
  providers,
  orderColumn,
  orderDirection,
  disabled,
}: {
  owner: LightWorkspaceType;
  period: ConsumptionPeriodSelection;
  limit: number;
  offset: number;
  search?: string;
  providers?: PokeTriggerProviderFilter[];
  orderColumn: PokeTriggerOrderColumn;
  orderDirection: "asc" | "desc";
  disabled?: boolean;
}) {
  const { fetcherWithBody } = useFetcher();
  const url = `${pokeTriggersUrl(owner.sId)}/search`;
  const body: PokeTriggerSearchBody = {
    period: period.kind,
    days:
      period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
    limit,
    offset,
    search: search?.trim() || undefined,
    providers,
    orderColumn,
    orderDirection,
  };

  const { data, error, isValidating, mutate } = useSWRWithDefaults<
    [string, PokeTriggerSearchBody, string],
    PokeTriggerSearchResponse
  >([url, body, "POST"], fetcherWithBody, {
    disabled,
    keepPreviousData: true,
    revalidateOnFocus: false,
  });

  return {
    triggers: data?.triggers ?? emptyArray<PokeTriggerSearchRow>(),
    totalTriggers: data?.total ?? 0,
    appliedOrderColumn: data?.appliedOrderColumn,
    appliedOrderDirection: data?.appliedOrderDirection,
    isTriggersLoading: !disabled && !error && !data,
    isTriggersValidating: !disabled && !error && isValidating,
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
