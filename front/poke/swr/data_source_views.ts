import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeListDataSourceViews } from "@app/pages/api/poke/workspaces/[wId]/data_source_views";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";

export function usePokeDataSourceViews({
  disabled,
  owner,
}: PokeConditionalFetchProps) {
  const dataSourceViewsFetcher: Fetcher<PokeListDataSourceViews> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/data_source_views`,
    dataSourceViewsFetcher,
    { disabled }
  );

  return {
    data: useMemo(() => (data ? data.data_source_views : []), [data]),
    isLoading: !error && !data,
    isError: error,
    mutateDocuments: mutate,
  };
}
