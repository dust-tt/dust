import type {
  PokeFrameDatabase,
  PokeFrameDetails,
  PokeFrameFunction,
  PokeFrameListItem,
  PokeListFrameDatabases,
  PokeListFrameFunctions,
  PokeListFrames,
} from "@app/lib/api/poke/frames";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

interface UsePokeFramesProps {
  disabled?: boolean;
  hasSandbox: boolean;
  limit: number;
  offset: number;
  owner: LightWorkspaceType;
}

export function usePokeFrames({
  disabled,
  hasSandbox,
  limit,
  offset,
  owner,
}: UsePokeFramesProps) {
  const { fetcher } = useFetcher();
  const framesFetcher: Fetcher<PokeListFrames> = fetcher;
  const params = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString(),
    hasSandbox: hasSandbox.toString(),
  });
  const { data, error, isValidating, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/frames?${params.toString()}`,
    framesFetcher,
    { disabled, keepPreviousData: true }
  );

  return {
    data: {
      items: data?.items ?? emptyArray<PokeFrameListItem>(),
      totalCount: data?.totalCount ?? 0,
      isValidating,
    },
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

interface UsePokeFrameSubResourceProps {
  disabled?: boolean;
  frameId: string;
  owner: LightWorkspaceType;
}

export function usePokeFrameFunctions({
  disabled,
  frameId,
  owner,
}: UsePokeFrameSubResourceProps) {
  const { fetcher } = useFetcher();
  const functionsFetcher: Fetcher<PokeListFrameFunctions> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/frames/${frameId}/functions`,
    functionsFetcher,
    { disabled }
  );

  return {
    data: data?.items ?? emptyArray<PokeFrameFunction>(),
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}

export function usePokeFrameDatabases({
  disabled,
  frameId,
  owner,
}: UsePokeFrameSubResourceProps) {
  const { fetcher } = useFetcher();
  const databasesFetcher: Fetcher<PokeListFrameDatabases> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/frames/${frameId}/databases`,
    databasesFetcher,
    { disabled }
  );

  return {
    data: data?.items ?? emptyArray<PokeFrameDatabase>(),
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
