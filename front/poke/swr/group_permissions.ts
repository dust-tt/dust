import type { PokeListGroupPermissions } from "@app/lib/api/poke/group_permissions";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GroupPermissionResourceType } from "@app/types/group_permissions";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

interface UsePokeGroupPermissionsProps {
  disabled?: boolean;
  owner: LightWorkspaceType;
  // Pass either a groupId (grants held by that group) or a resourceType +
  // resourceId (grants that apply to that resource instance).
  groupId?: string;
  resourceType?: GroupPermissionResourceType;
  resourceId?: number;
}

export function usePokeGroupPermissions({
  disabled,
  owner,
  groupId,
  resourceType,
  resourceId,
}: UsePokeGroupPermissionsProps) {
  const { fetcher } = useFetcher();
  const groupPermissionsFetcher: Fetcher<PokeListGroupPermissions> = fetcher;

  const params = new URLSearchParams();
  if (groupId !== undefined) {
    params.set("groupId", groupId);
  }
  if (resourceType !== undefined) {
    params.set("resourceType", resourceType);
  }
  if (resourceId !== undefined) {
    params.set("resourceId", String(resourceId));
  }

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/group_permissions?${params.toString()}`,
    groupPermissionsFetcher,
    { disabled }
  );

  return {
    data: data?.groupPermissions ?? emptyArray(),
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
