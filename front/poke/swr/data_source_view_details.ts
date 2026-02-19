import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeGetDataSourceViewDetails } from "@app/pages/api/poke/workspaces/[wId]/data_source_views/[dsvId]/details";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

interface UsePokeDataSourceViewDetailsProps {
  disabled?: boolean;
  owner: LightWorkspaceType;
  dataSourceViewId: string;
}

export function usePokeDataSourceViewDetails({
  disabled,
  owner,
  dataSourceViewId,
}: UsePokeDataSourceViewDetailsProps) {
  const detailsFetcher: Fetcher<PokeGetDataSourceViewDetails> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/data_source_views/${dataSourceViewId}/details`,
    detailsFetcher,
    { disabled }
  );

  return {
    data: data ?? null,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
