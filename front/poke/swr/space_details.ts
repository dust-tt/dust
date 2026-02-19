import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeGetSpaceDetails } from "@app/pages/api/poke/workspaces/[wId]/spaces/[spaceId]/details";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

interface UsePokeSpaceDetailsProps {
  disabled?: boolean;
  owner: LightWorkspaceType;
  spaceId: string;
}

export function usePokeSpaceDetails({
  disabled,
  owner,
  spaceId,
}: UsePokeSpaceDetailsProps) {
  const spaceDetailsFetcher: Fetcher<PokeGetSpaceDetails> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/spaces/${spaceId}/details`,
    spaceDetailsFetcher,
    { disabled }
  );

  return {
    data: data ?? null,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
