import type { SpaceType } from "@dust-tt/client";
import { useDustAPI } from "@extension/shared/lib/dust_api";
import { useSWRWithDefaults } from "@extension/shared/lib/swr";
import { useMemo } from "react";

type SpacesKey = ["getSpaces", string];

export function useSpaces() {
  const dustAPI = useDustAPI();
  const spacesFetcher = async () => {
    const res = await dustAPI.getSpaces();
    if (res.isOk()) {
      return res.value;
    }
    throw res.error;
  };

  const { data, error, mutate } = useSWRWithDefaults<
    SpacesKey,
    SpaceType[] | null
  >(["getSpaces", dustAPI.workspaceId()], spacesFetcher);

  return {
    spaces: useMemo(() => data ?? [], [data]),
    isSpacesLoading: !error && !data,
    isSpacesError: error,
    mutateSpaces: mutate,
  };
}
