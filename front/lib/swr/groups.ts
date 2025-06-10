import { useMemo } from "react";
import type { Fetcher } from "swr";

import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetGroupsResponseBody } from "@app/pages/api/w/[wId]/groups";
import type { GroupKind, LightWorkspaceType } from "@app/types";

export function useGroups({
  owner,
  kinds,
  disabled,
}: {
  owner: LightWorkspaceType;
  kinds?: GroupKind[];
  disabled?: boolean;
}) {
  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (kinds && kinds.length > 0) {
      kinds.forEach((k) => params.append("kind", k));
    }
    const queryString = params.toString();
    return `/api/w/${owner.sId}/groups${queryString ? `?${queryString}` : ""}`;
  }, [owner.sId, kinds]);

  const groupsFetcher: Fetcher<GetGroupsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(url, groupsFetcher, {
    disabled,
  });

  return {
    groups: data ? data.groups : emptyArray(),
    isGroupsLoading: !error && !data && !disabled,
    isGroupsError: !!error,
    mutateGroups: mutate,
  };
}
