import { useMemo } from "react";
import type { Fetcher } from "swr";

import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetGroupsResponseBody } from "@app/pages/api/w/[wId]/groups";
import type { GroupKind, GroupType, LightWorkspaceType } from "@app/types";

export function useGroups({
  owner,
  kinds,
  spaceId,
  disabled,
}: {
  owner: LightWorkspaceType;
  kinds?: GroupKind[];
  spaceId?: string;
  disabled?: boolean;
}) {
  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (kinds && kinds.length > 0) {
      kinds.forEach((k) => params.append("kind", k));
    }
    if (spaceId) {
      params.append("spaceId", spaceId);
    }
    const queryString = params.toString();
    return `/api/w/${owner.sId}/groups${queryString ? `?${queryString}` : ""}`;
  }, [owner.sId, kinds, spaceId]);

  const groupsFetcher: Fetcher<GetGroupsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(url, groupsFetcher, {
    disabled,
  });

  return {
    groups: data ? data.groups : emptyArray<GroupType>(),
    isGroupsLoading: !error && !data && !disabled,
    isGroupsError: !!error,
    mutateGroups: mutate,
  };
}
