import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeGetWorkspaceInfo } from "@app/pages/api/poke/workspaces/[wId]/workspace-info";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";

export function usePokeWorkspaceInfo({
  disabled,
  owner,
}: PokeConditionalFetchProps) {
  const workspaceInfoFetcher: Fetcher<PokeGetWorkspaceInfo> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/workspace-info`,
    workspaceInfoFetcher,
    { disabled }
  );

  return {
    data: data ?? null,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
