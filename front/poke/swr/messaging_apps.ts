import type { PokeGetMessagingApps } from "@app/lib/api/poke/messaging_apps";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { Fetcher } from "swr";

export function usePokeMessagingApps({
  disabled,
  owner,
}: PokeConditionalFetchProps) {
  const { fetcher } = useFetcher();
  const messagingAppsFetcher: Fetcher<PokeGetMessagingApps> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/messaging_apps`,
    messagingAppsFetcher,
    { disabled }
  );

  return {
    data: data?.messagingApps ?? emptyArray(),
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
