import type { PokeGetDataRetentionResponseBody } from "@app/lib/api/poke/data_retention";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { Fetcher } from "swr";

export function usePokeDataRetention({
  disabled,
  owner,
}: PokeConditionalFetchProps) {
  const { fetcher } = useFetcher();
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
