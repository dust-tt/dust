import type {
  PokeFrameDetails,
  PokeFrameListItem,
  PokeListFrameDatabases,
  PokeListFrameFunctions,
  PokeListFrames,
} from "@app/lib/api/poke/frames";
import type { PokePodFunction } from "@app/lib/api/poke/projects";
import type { LiveDatabaseEntry } from "@app/lib/api/sandbox_functions/dsbx_db";
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
    data: data?.items ?? emptyArray<PokePodFunction>(),
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
    data: data?.items ?? emptyArray<LiveDatabaseEntry>(),
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
