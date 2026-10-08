import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetGroupsUsageResponseBody } from "@app/types/api/groups/shared_usage_limit";
import type { LightWorkspaceType } from "@app/types/user";
import { useMemo } from "react";
import type { Fetcher } from "swr";

export function groupsUsageUrl(workspaceId: string) {
  return `/api/w/${workspaceId}/credits/groups-usage`;
}

export function useGroupsUsage({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const groupsUsageFetcher: Fetcher<GetGroupsUsageResponseBody> = fetcher;

  const { data, error } = useSWRWithDefaults(
    groupsUsageUrl(owner.sId),
    groupsUsageFetcher,
    { disabled }
  );

  const usageByGroupId = useMemo(
    () => new Map((data?.groups ?? []).map((usage) => [usage.groupId, usage])),
    [data]
  );

  return {
    usageByGroupId,
    isGroupsUsageLoading: !error && !data && !disabled,
    isGroupsUsageError: !!error,
  };
}

export function useSharedUsageLimitGroupColumn({
  owner,
  enabled,
  disabled,
}: {
  owner: LightWorkspaceType;
  enabled: boolean;
  disabled: boolean;
}) {
  const { usageByGroupId, isGroupsUsageLoading, isGroupsUsageError } =
    useGroupsUsage({
      owner,
      disabled: !enabled || disabled,
    });

  return {
    showSharedUsageLimitGroupColumn: enabled && !isGroupsUsageError,
    sharedUsageLimitUsageByGroupId: usageByGroupId,
    isSharedUsageLimitUsageLoading: isGroupsUsageLoading,
  };
}
