import type {
  PokeFrameDetails,
  PokeFrameListItem,
  PokeListFrames,
} from "@app/lib/api/poke/frames";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

interface UsePokeFramesProps {
  disabled?: boolean;
  owner: LightWorkspaceType;
}

export function usePokeFrames({ disabled, owner }: UsePokeFramesProps) {
  const { fetcher } = useFetcher();
  const framesFetcher: Fetcher<PokeListFrames> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/frames`,
    framesFetcher,
    { disabled }
  );

  return {
    data: data?.items ?? emptyArray<PokeFrameListItem>(),
    hasMore: data?.hasMore ?? false,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}

interface UsePokeFrameDetailsProps {
  disabled?: boolean;
  frameId: string;
  owner: LightWorkspaceType;
}

export function usePokeFrameDetails({
  disabled,
  frameId,
  owner,
}: UsePokeFrameDetailsProps) {
  const { fetcher } = useFetcher();
  const detailsFetcher: Fetcher<PokeFrameDetails> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/frames/${frameId}`,
    detailsFetcher,
    { disabled }
  );

  return {
    details: data ?? null,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
