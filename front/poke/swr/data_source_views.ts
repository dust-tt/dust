import type {
  DataSourceViewWithUsage,
  PokeListDataSourceViews,
} from "@app/lib/api/poke/data_source_views";
import { createUseInfiniteContentNodes } from "@app/lib/swr/data_source_views";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { Fetcher } from "swr";

export function usePokeDataSourceViews({
  disabled,
  owner,
}: PokeConditionalFetchProps) {
  const { fetcher } = useFetcher();
  const dataSourceViewsFetcher: Fetcher<PokeListDataSourceViews> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/data_source_views`,
    dataSourceViewsFetcher,
    { disabled }
  );

  return {
    data: data?.data_source_views ?? emptyArray<DataSourceViewWithUsage>(),
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}

export const usePokeInfiniteDataSourceViewContentNodes =
  createUseInfiniteContentNodes(
    ({ owner, dataSourceView }, searchParams) =>
      `/api/poke/workspaces/${owner.sId}/spaces/${dataSourceView.spaceId}/data_source_views/${dataSourceView.sId}/content-nodes?${searchParams}`
  );
