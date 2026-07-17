import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  GetGovernancePermissionsResponseBody,
  GovernancePermissionsByKey,
} from "@app/types/api/governance";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

// Stable empty reference so the default doesn't create a new object on every render.
const EMPTY_GOVERNANCE_PERMISSIONS: GovernancePermissionsByKey = {};

export function useGovernancePermissions(
  owner: LightWorkspaceType,
  { disabled }: { disabled?: boolean } = {}
) {
  const { fetcher } = useFetcher();
  const url = `/api/w/${owner.sId}/governance-permissions`;

  const governanceFetcher: Fetcher<GetGovernancePermissionsResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(url, governanceFetcher, {
    disabled,
  });

  return {
    governancePermissions:
      data?.governancePermissions ?? EMPTY_GOVERNANCE_PERMISSIONS,
    isLoading: !error && !data && !disabled,
    isGovernancePermissionsError: !!error,
    mutateGovernancePermissions: mutate,
  };
}
