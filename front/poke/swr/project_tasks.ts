import type { PokeListProjectTasks } from "@app/lib/api/poke/projects";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

interface UsePokeProjectTasksProps {
  disabled?: boolean;
  owner: LightWorkspaceType;
  projectId: string;
}

export function usePokeProjectTasks({
  disabled,
  owner,
  projectId,
}: UsePokeProjectTasksProps) {
  const { fetcher } = useFetcher();
  const tasksFetcher: Fetcher<PokeListProjectTasks> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/projects/${projectId}/tasks`,
    tasksFetcher,
    { disabled }
  );

  return {
    data: data?.tasks ?? emptyArray(),
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
