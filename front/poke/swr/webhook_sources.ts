import type { PokeListWebhookSources } from "@app/lib/api/poke/webhook_sources";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { Fetcher } from "swr";

export function usePokeWebhookSources({
  disabled,
  owner,
}: PokeConditionalFetchProps) {
  const { fetcher } = useFetcher();
  const webhookSourcesFetcher: Fetcher<PokeListWebhookSources> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/webhook_sources`,
    webhookSourcesFetcher,
    { disabled }
  );

  return {
    data: data?.webhookSources ?? [],
    isLoading: !error && !data,
    isError: error,
    mutate,
  };
}
