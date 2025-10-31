import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  PokeListWebhookRequests,
  PokeWebhookRequestType,
} from "@app/pages/api/poke/workspaces/[wId]/webhook_sources/[webhookSourceId]/requests";
import type { LightWorkspaceType } from "@app/types/user";

export function usePokeWebhookRequests({
  disabled,
  owner,
  webhookSourceId,
}: {
  disabled?: boolean;
  owner: LightWorkspaceType;
  webhookSourceId: string;
}) {
  const webhookRequestsFetcher: Fetcher<PokeListWebhookRequests> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/webhook_sources/${webhookSourceId}/requests`,
    webhookRequestsFetcher,
    { disabled }
  );

  return {
    data: data?.webhookRequests ?? [],
    isLoading: !error && !data,
    isError: error,
    mutate,
  };
}
