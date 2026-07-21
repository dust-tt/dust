import type { PokeListProjectPodFunctions } from "@app/lib/api/poke/projects";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

interface UsePokeProjectPodFunctionProps {
  disabled?: boolean;
  owner: LightWorkspaceType;
  projectId: string;
}

export function usePokeProjectPodFunction({
  disabled,
  owner,
  projectId,
}: UsePokeProjectPodFunctionProps) {
  const { fetcher } = useFetcher();
  const podFunctionFetcher: Fetcher<PokeListProjectPodFunctions> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/projects/${projectId}/pod-functions`,
    podFunctionFetcher,
    { disabled }
  );

  return {
    data:
      data?.items ?? emptyArray<PokeListProjectPodFunctions["items"][number]>(),
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
