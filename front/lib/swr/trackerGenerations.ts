import type { LightWorkspaceType, SpaceType } from "@dust-tt/types";
import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetTrackerGenerationsResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/trackers/[trackerId]/generations";

export function useTrackerGenerations({
  disabled,
  owner,
  space,
  trackerId,
}: {
  disabled?: boolean;
  owner: LightWorkspaceType;
  space: SpaceType;
  trackerId: string | null;
}) {
  const trackerGenerationsFetcher: Fetcher<GetTrackerGenerationsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    trackerId
      ? `/api/w/${owner.sId}/spaces/${space.sId}/trackers/${trackerId}/generations`
      : null,
    trackerGenerationsFetcher,
    {
      disabled,
    }
  );

  return {
    generations: useMemo(() => (data ? data.generations : []), [data]),
    isGenerationsLoading: !error && !data,
    isGenerationsError: !!error,
    mutateGenerations: mutate,
  };
}
