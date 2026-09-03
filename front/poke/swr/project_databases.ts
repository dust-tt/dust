import type {
  PokeListProjectDatabases,
  PokeProjectDatabase,
} from "@app/lib/api/poke/projects";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

interface UsePokeProjectDatabasesProps {
  disabled?: boolean;
  owner: LightWorkspaceType;
  projectId: string;
}

export function usePokeProjectDatabases({
  disabled,
  owner,
  projectId,
}: UsePokeProjectDatabasesProps) {
  const { fetcher } = useFetcher();
  const projectDatabasesFetcher: Fetcher<PokeListProjectDatabases> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/projects/${projectId}/databases`,
    projectDatabasesFetcher,
    { disabled }
  );

  return {
    data: data?.items ?? emptyArray<PokeProjectDatabase>(),
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
