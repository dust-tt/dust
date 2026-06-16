import type { PokeGetMemberships } from "@app/lib/api/poke/memberships";
import {
  type PokeSearchWorkspaceMembers,
  parsePokeSearchWorkspaceMembers,
} from "@app/lib/api/poke/memberships";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback } from "react";
import type { Fetcher } from "swr";

export function usePokeMemberships({
  disabled,
  owner,
}: PokeConditionalFetchProps) {
  const { fetcher } = useFetcher();
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

export function usePokeWorkspaceMembersSearch({
  disabled,
  limit = 25,
  owner,
  query,
}: {
  disabled?: boolean;
  limit?: number;
  owner: Pick<LightWorkspaceType, "sId">;
  query: string;
}) {
  const { fetcher } = useFetcher();

  const searchFetcher: Fetcher<PokeSearchWorkspaceMembers> = useCallback(
    async (url: string) => {
      const json = await fetcher(url);
      return parsePokeSearchWorkspaceMembers(json);
    },
    [fetcher]
  );

  const params = new URLSearchParams({ limit: String(limit) });
  if (query.trim()) {
    params.set("q", query.trim());
  }

  const { data, error, isValidating } = useSWRWithDefaults(
    disabled
      ? null
      : `/api/poke/workspaces/${owner.sId}/memberships/search?${params.toString()}`,
    searchFetcher,
    { disabled, keepPreviousData: true, revalidateOnFocus: false }
  );

  return {
    members: data?.members ?? emptyArray(),
    isLoading: !error && !data && !disabled,
    isError: error,
    isValidating,
  };
}
