import type { PokeListProjectKnowledgeFromConnectors } from "@app/lib/api/poke/projects";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

interface UsePokeProjectConnectorKnowledgeProps {
  disabled?: boolean;
  owner: LightWorkspaceType;
  projectId: string;
}

export function usePokeProjectConnectorKnowledge({
  disabled,
  owner,
  projectId,
}: UsePokeProjectConnectorKnowledgeProps) {
  const { fetcher } = useFetcher();
  const connectorKnowledgeFetcher: Fetcher<PokeListProjectKnowledgeFromConnectors> =
    fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/projects/${projectId}/connector-knowledge`,
    connectorKnowledgeFetcher,
    { disabled }
  );

  return {
    data:
      data?.items ??
      emptyArray<PokeListProjectKnowledgeFromConnectors["items"][number]>(),
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
