import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeGetMemberships } from "@app/pages/api/poke/workspaces/[wId]/memberships";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { Fetcher } from "swr";

export function usePokeMemberships({
  disabled,
  owner,
}: PokeConditionalFetchProps) {
  const membershipsFetcher: Fetcher<PokeGetMemberships> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/memberships`,
    membershipsFetcher,
    { disabled }
  );

  return {
    data: data ?? null,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
