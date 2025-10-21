import type { Fetcher } from "swr";

import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetPokeSearchItemsResponseBody } from "@app/pages/api/poke/search";

export function usePokeSearch({
  disabled,
  search,
}: {
  disabled?: boolean;
  search?: string;
} = {}) {
  const workspacesFetcher: Fetcher<GetPokeSearchItemsResponseBody> = fetcher;

  const queryParams = new URLSearchParams({
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    search: search || "",
  });

  const { data, error } = useSWRWithDefaults(
    `/api/poke/search?${queryParams.toString()}`,
    workspacesFetcher,
    {
      disabled,
    }
  );

  return {
    results: data?.results ?? emptyArray(),
    isLoading: !error && !data && !disabled,
    isError: error,
  };
}
