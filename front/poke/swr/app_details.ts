import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeGetAppDetails } from "@app/pages/api/poke/workspaces/[wId]/apps/[aId]/details";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

interface UsePokeAppDetailsProps {
  disabled?: boolean;
  owner: LightWorkspaceType;
  appId: string;
  hash?: string | null;
}

export function usePokeAppDetails({
  disabled,
  owner,
  appId,
  hash,
}: UsePokeAppDetailsProps) {
  const detailsFetcher: Fetcher<PokeGetAppDetails> = fetcher;
  const hashParam = hash ? `?hash=${hash}` : "";
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/apps/${appId}/details${hashParam}`,
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
