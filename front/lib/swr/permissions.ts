import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetPermissionsResponseBody } from "@app/types/api/governance";
import type {
  ConcreteResourceType,
  GrantVerb,
} from "@app/types/group_permissions";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useMemo } from "react";
import type { Fetcher, SWRConfiguration } from "swr";

// Workspace permissions rarely change within a session, so we keep the query cheap: dedupe
// identical requests within a minute and throttle focus-triggered revalidations to five minutes.
// This mirrors the low-churn strategy we use for other capability lookups.
const WORKSPACE_PERMISSIONS_SWR_OPTIONS: SWRConfiguration = {
  dedupingInterval: 60 * 1000,
  focusThrottleInterval: 5 * 60 * 1000,
};

export function useWorkspacePermissions(
  owner: LightWorkspaceType,
  { disabled }: { disabled?: boolean } = {}
) {
  const { fetcher } = useFetcher();

  const permissionsFetcher: Fetcher<GetPermissionsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/permissions`,
    permissionsFetcher,
    { ...WORKSPACE_PERMISSIONS_SWR_OPTIONS, disabled }
  );

  const workspacePermissions = useMemo(
    () => data?.workspacePermissions,
    [data]
  );

  const hasPermission = useCallback(
    (resourceType: ConcreteResourceType, verb: GrantVerb): boolean =>
      workspacePermissions?.[resourceType]?.includes(verb) ?? false,
    [workspacePermissions]
  );

  return {
    workspacePermissions,
    hasPermission,
    isWorkspacePermissionsLoading: !error && !data && !disabled,
    isWorkspacePermissionsError: !!error,
    mutateWorkspacePermissions: mutate,
  };
}
