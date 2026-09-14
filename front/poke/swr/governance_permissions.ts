import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type {
  GetGovernancePermissionsResponseBody,
  GovernancePermissionsByKey,
} from "@app/types/api/governance";
import type { Fetcher } from "swr";

// Stable empty reference so the default doesn't create a new object on every render.
const EMPTY_GOVERNANCE_PERMISSIONS: GovernancePermissionsByKey = {};

export function usePokeGovernancePermissions({
  disabled,
  owner,
}: PokeConditionalFetchProps) {
  const { fetcher } = useFetcher();
  const governancePermissionsFetcher: Fetcher<GetGovernancePermissionsResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/governance_permissions`,
    governancePermissionsFetcher,
    { disabled }
  );

  return {
    data: data?.governancePermissions ?? EMPTY_GOVERNANCE_PERMISSIONS,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
