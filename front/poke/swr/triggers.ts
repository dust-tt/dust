import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeListTriggers } from "@app/pages/api/poke/workspaces/[wId]/triggers";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";

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
