import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeGetWebhookSourceDetails } from "@app/pages/api/poke/workspaces/[wId]/webhook_sources/[wsId]/details";
import type { LightWorkspaceType } from "@app/types/user";

interface UsePokeWebhookSourceDetailsProps {
  disabled?: boolean;
  owner: LightWorkspaceType;
  webhookSourceId: string;
}

export function usePokeWebhookSourceDetails({
  disabled,
  owner,
  webhookSourceId,
}: UsePokeWebhookSourceDetailsProps) {
  const detailsFetcher: Fetcher<PokeGetWebhookSourceDetails> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/webhook_sources/${webhookSourceId}/details`,
    detailsFetcher,
    { disabled }
  );

  return {
    data: data ?? null,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
