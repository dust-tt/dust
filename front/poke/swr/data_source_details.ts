import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeGetDataSourceDetails } from "@app/pages/api/poke/workspaces/[wId]/data_sources/[dsId]/details";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

interface UsePokeDataSourceDetailsProps {
  disabled?: boolean;
  owner: LightWorkspaceType;
  dsId: string;
}

export function usePokeDataSourceDetails({
  disabled,
  owner,
  dsId,
}: UsePokeDataSourceDetailsProps) {
  const dataSourceDetailsFetcher: Fetcher<PokeGetDataSourceDetails> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/data_sources/${dsId}/details`,
    dataSourceDetailsFetcher,
    { disabled }
  );

  return {
    data: data ?? null,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
