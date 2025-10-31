import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeListWebhookSourceViews } from "@app/pages/api/poke/workspaces/[wId]/webhook_source_views";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { WebhookSourceViewForAdminType } from "@app/types/triggers/webhooks";

export function usePokeWebhookSourceViews({
  disabled,
  owner,
}: PokeConditionalFetchProps) {
  const webhookSourceViewsFetcher: Fetcher<PokeListWebhookSourceViews> =
    fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/webhook_source_views`,
    webhookSourceViewsFetcher,
    { disabled }
  );

  return {
    data: data?.webhookSourceViews ?? [],
    isLoading: !error && !data,
    isError: error,
    mutate,
  };
}
