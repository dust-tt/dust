import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetGroupsUsageResponseBody } from "@app/types/api/groups/group_limit";
import type { LightWorkspaceType } from "@app/types/user";
import { useMemo } from "react";
import type { Fetcher } from "swr";

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
    `/api/w/${owner.sId}/credits/groups-usage`,
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
