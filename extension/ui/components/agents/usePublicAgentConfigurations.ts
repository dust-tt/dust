import { useDustAPI } from "@app/shared/lib/dust_api";
import { useSWRWithDefaults } from "@app/shared/lib/swr";
import type { AgentConfigurationViewType } from "@dust-tt/client";
import { useMemo } from "react";

export function usePublicAgentConfigurations(
  view?: AgentConfigurationViewType,
  includes: "authors"[] = []
) {
  const dustAPI = useDustAPI();

  const agentConfigurationsFetcher = async () => {
    const res = await dustAPI.getAgentConfigurations({ view, includes });
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
