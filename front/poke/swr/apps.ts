import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeListApps } from "@app/pages/api/poke/workspaces/[wId]/apps";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import { AppType } from "@app/types";

const EMPTY_ARRAY: AppType[] = [];

export function usePokeApps({ disabled, owner }: PokeConditionalFetchProps) {
  const dataSourceViewsFetcher: Fetcher<PokeListApps> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/apps`,
    dataSourceViewsFetcher,
    { disabled }
  );

  return {
    data: data?.apps ?? EMPTY_ARRAY,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
