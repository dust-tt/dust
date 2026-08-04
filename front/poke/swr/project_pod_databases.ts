import type {
  PokeListProjectPodDatabases,
  PokePodDatabase,
} from "@app/lib/api/poke/projects";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

interface UsePokeProjectPodDatabasesProps {
  disabled?: boolean;
  owner: LightWorkspaceType;
  projectId: string;
}

export function usePokeProjectPodDatabases({
  disabled,
  owner,
  projectId,
}: UsePokeProjectPodDatabasesProps) {
  const { fetcher } = useFetcher();
  const podDatabasesFetcher: Fetcher<PokeListProjectPodDatabases> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/projects/${projectId}/pod-databases`,
    podDatabasesFetcher,
    { disabled }
  );

  return {
    data: data?.items ?? emptyArray<PokePodDatabase>(),
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
