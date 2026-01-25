import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeGetAgentDetails } from "@app/pages/api/poke/workspaces/[wId]/agent_configurations/[aId]/details";
import type { LightWorkspaceType } from "@app/types";

interface UsePokeAgentDetailsProps {
  disabled?: boolean;
  owner: LightWorkspaceType;
  aId: string;
}

export function usePokeAgentDetails({
  disabled,
  owner,
  aId,
}: UsePokeAgentDetailsProps) {
  const agentDetailsFetcher: Fetcher<PokeGetAgentDetails> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/agent_configurations/${aId}/details`,
    agentDetailsFetcher,
    { disabled }
  );

  return {
    data: data ?? null,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
