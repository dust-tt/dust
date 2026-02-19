import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeGetGroupDetails } from "@app/pages/api/poke/workspaces/[wId]/groups/[groupId]/details";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

interface UsePokeGroupDetailsProps {
  disabled?: boolean;
  owner: LightWorkspaceType;
  groupId: string;
}

export function usePokeGroupDetails({
  disabled,
  owner,
  groupId,
}: UsePokeGroupDetailsProps) {
  const groupDetailsFetcher: Fetcher<PokeGetGroupDetails> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/groups/${groupId}/details`,
    groupDetailsFetcher,
    { disabled }
  );

  return {
    data: data ?? null,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
