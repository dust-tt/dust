import type { AgentConfigurationViewType } from "@dust-tt/client";
import { useDustAPI } from "@extension/lib/dust_api";
import { useSWRWithDefaults } from "@extension/lib/swr";
import { useMemo } from "react";

export function usePublicAgentConfigurations(
  view?: AgentConfigurationViewType
) {
  const dustAPI = useDustAPI();

  const agentConfigurationsFetcher = async () => {
    const res = await dustAPI.getAgentConfigurations(view);
    if (res.isOk()) {
      return res.value;
    }
    throw res.error;
  };

  const { data, error, mutate, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(
      ["getAgentConfigurations", dustAPI.workspaceId(), view],
      agentConfigurationsFetcher
    );

  return {
    agentConfigurations: useMemo(() => data ?? [], [data]),
    isAgentConfigurationsLoading: !error && !data,
    isAgentConfigurationsError: error,
    mutate,
    mutateRegardlessOfQueryParams,
  };
}
