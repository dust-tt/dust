import type { PokeGetProjectWorkflow } from "@app/lib/api/poke/projects";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

interface UsePokeProjectWorkflowProps {
  disabled?: boolean;
  owner: LightWorkspaceType;
  projectId: string;
}

export function usePokeProjectWorkflow({
  disabled,
  owner,
  projectId,
}: UsePokeProjectWorkflowProps) {
  const { fetcher } = useFetcher();
  const workflowFetcher: Fetcher<PokeGetProjectWorkflow> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/projects/${projectId}/tasks-workflow`,
    workflowFetcher,
    { disabled }
  );

  return {
    data: data ?? null,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
