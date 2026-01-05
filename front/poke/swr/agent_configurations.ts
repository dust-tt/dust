import type { Fetcher } from "swr";

import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeGetAgentConfigurationsResponseBody } from "@app/pages/api/poke/workspaces/[wId]/agent_configurations";
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
  const agentConfigurationsFetcher: Fetcher<PokeGetAgentConfigurationsResponseBody> =
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
