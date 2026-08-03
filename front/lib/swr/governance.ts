import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  GetGovernancePermissionsResponseBody,
  GovernancePermissionsByKey,
  PatchGovernancePermissionResponseBody,
} from "@app/types/api/governance";
import type { GovernancePermission } from "@app/types/group_permissions";
import { capabilityKey } from "@app/types/group_permissions";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback } from "react";
import type { Fetcher } from "swr";

// Stable empty reference so the default doesn't create a new object on every render.
const EMPTY_GOVERNANCE_PERMISSIONS: GovernancePermissionsByKey = {};

function governancePermissionsUrl(owner: LightWorkspaceType) {
  return `/api/w/${owner.sId}/governance-permissions`;
}

export function useGovernancePermissions(
  owner: LightWorkspaceType,
  { disabled }: { disabled?: boolean } = {}
) {
  const { fetcher } = useFetcher();

  const governanceFetcher: Fetcher<GetGovernancePermissionsResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    governancePermissionsUrl(owner),
    governanceFetcher,
    { disabled }
  );

  return {
    governancePermissions:
      data?.governancePermissions ?? EMPTY_GOVERNANCE_PERMISSIONS,
    isLoading: !error && !data && !disabled,
    isGovernancePermissionsError: !!error,
    mutateGovernancePermissions: mutate,
  };
}

export function useUpdateGovernancePermission(owner: LightWorkspaceType) {
  const sendNotification = useSendNotification();
  const { mutateGovernancePermissions } = useGovernancePermissions(owner, {
    disabled: true,
  });

  return useCallback(
    async (permission: GovernancePermission): Promise<boolean> => {
      const res = await clientFetch(governancePermissionsUrl(owner), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(permission),
      });

      if (!res.ok) {
        sendNotification({
          type: "error",
          title: "Failed to update permission",
        });
        return false;
      }

      const { governancePermission }: PatchGovernancePermissionResponseBody =
        await res.json();
      await mutateGovernancePermissions(
        (current) =>
          current && {
            governancePermissions: {
              ...current.governancePermissions,
              [capabilityKey(governancePermission)]: governancePermission,
            },
          },
        { revalidate: false }
      );

      return true;
    },
    [owner, mutateGovernancePermissions, sendNotification]
  );
}
