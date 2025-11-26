import type { Fetcher } from "swr";

import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeListCreditsResponseBody } from "@app/pages/api/poke/workspaces/[wId]/credits";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";

export function usePokeCredits({ disabled, owner }: PokeConditionalFetchProps) {
  const creditsFetcher: Fetcher<PokeListCreditsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/credits`,
    creditsFetcher,
    { disabled }
  );

  return {
    data: data?.credits ?? emptyArray(),
    isLoading: !error && !data,
    isError: error,
    mutate,
  };
}
