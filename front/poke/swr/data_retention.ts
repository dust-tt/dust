import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeGetDataRetentionResponseBody } from "@app/pages/api/poke/workspaces/[wId]/data_retention";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";

export function usePokeDataRetention({
  disabled,
  owner,
}: PokeConditionalFetchProps) {
  const dataRetentionFetcher: Fetcher<PokeGetDataRetentionResponseBody> =
    fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/data_retention`,
    dataRetentionFetcher,
    { disabled }
  );

  return {
    data: data?.data,
    isLoading: !error && !data,
    isError: error,
    mutate,
  };
}
