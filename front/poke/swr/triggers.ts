import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeListTriggers } from "@app/pages/api/poke/workspaces/[wId]/triggers";
import type { PokeGetWebhookRequestsResponseBody } from "@app/pages/api/poke/workspaces/[wId]/triggers/[tId]/webhook_requests";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { LightWorkspaceType } from "@app/types";

export function usePokeTriggers({
  disabled,
  owner,
}: PokeConditionalFetchProps) {
  const triggersFetcher: Fetcher<PokeListTriggers> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/triggers`,
    triggersFetcher,
    { disabled }
  );

  return {
    data: data?.triggers ?? [],
    isLoading: !error && !data,
    isError: error,
    mutate,
  };
}

export function usePokeWebhookRequests({
  owner,
  triggerId,
  disabled,
}: {
  owner: LightWorkspaceType;
  triggerId: string;
  disabled?: boolean;
}) {
  const requestsFetcher: Fetcher<PokeGetWebhookRequestsResponseBody> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/triggers/${triggerId}/webhook_requests`,
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
