import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetPokeSearchItemsResponseBody } from "@app/pages/api/poke/search";
import { PokeItemBase } from "@app/types";

const EMPTY_ARRAY: PokeItemBase[] = [];

export function usePokeSearch({
  disabled,
  search,
}: {
  disabled?: boolean;
  search?: string;
} = {}) {
  const workspacesFetcher: Fetcher<GetPokeSearchItemsResponseBody> = fetcher;

  const queryParams = new URLSearchParams({
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
    results: data?.results ?? EMPTY_ARRAY,
    isLoading: !error && !data && !disabled,
    isError: error,
  };
}
