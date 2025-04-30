import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetAgentConfigurationsResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import { LightAgentConfigurationType } from "@app/types";

type PokeAgentConfigurationsProps = PokeConditionalFetchProps & {
  agentsGetView?: "admin_internal" | "archived";
};

const EMPTY_ARRAY: LightAgentConfigurationType[] = [];

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
    data: data?.agentConfigurations ?? EMPTY_ARRAY,
    isLoading: !error && !data,
    isError: error,
    mutate,
  };
}
