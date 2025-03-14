import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetTrackersResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/trackers";
import type { LightWorkspaceType, SpaceType } from "@app/types";

export function useTrackers({
  disabled,
  owner,
  space,
}: {
  disabled?: boolean;
  owner: LightWorkspaceType;
  space: SpaceType;
}) {
  const trackersFetcher: Fetcher<GetTrackersResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/spaces/${space.sId}/trackers`,
    trackersFetcher,
    {
      disabled,
    }
  );

  return {
    trackers: useMemo(() => (data ? data.trackers : []), [data]),
    isTrackersLoading: !error && !data,
    isTrackersError: !!error,
    mutateTrackers: mutate,
  };
}
