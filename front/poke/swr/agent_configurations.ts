import type { Fetcher } from "swr";

import { fetcher, emptyArray, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetAgentConfigurationsResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";

type PokeAgentConfigurationsProps = PokeConditionalFetchProps & {
  agentsGetView?: "admin_internal" | "archived";
};

/*
 * Agent configurations for poke. Currently only supports archived agent.
 * A null agentsGetView means no fetching
 */
export function usePokeAgentConfigurations({
  agentsGetView = "admin_internal",
  disabled,
  owner,
}: PokeAgentConfigurationsProps) {
  const agentConfigurationsFetcher: Fetcher<GetAgentConfigurationsResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/agent_configurations?view=${agentsGetView}`,
    agentConfigurationsFetcher,
    { disabled }
  );

  return {
    data: data?.agentConfigurations ?? emptyArray(),
    isLoading: !error && !data,
    isError: error,
    mutate,
  };
}
