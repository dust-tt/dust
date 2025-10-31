import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeGetWebhookRequestsResponseBody } from "@app/pages/api/poke/workspaces/[wId]/triggers/[tId]/webhook_requests";
import type { LightWorkspaceType } from "@app/types/user";

export function usePokeWebhookRequestTriggers({
  disabled,
  owner,
  triggerId,
}: {
  disabled?: boolean;
  owner: LightWorkspaceType;
  triggerId: string;
}) {
  const webhookRequestTriggersFetcher: Fetcher<PokeGetWebhookRequestsResponseBody> =
    fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/triggers/${triggerId}/webhook_requests`,
    webhookRequestTriggersFetcher,
    { disabled }
  );

  return {
    data: data?.requests ?? [],
    isLoading: !error && !data,
    isError: error,
    mutate,
  };
}
