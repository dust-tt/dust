import type { LightAgentConfigurationType } from "@dust-tt/client";
import { useMemo } from "react";

import { useSWRWithDefaults } from "@/lib/swr";
import { useDustAPI } from "@/lib/useDustAPI";

export function useAgentConfigurations() {
  const dustAPI = useDustAPI();

  const agentConfigurationsFetcher = async () => {
    const res = await dustAPI.getAgentConfigurations({});
    if (res.isOk()) {
      return res.value;
    }
    throw res.error;
  };

  const { data, error, mutate, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults<
      ["getAgentConfigurations", string],
      LightAgentConfigurationType[]
    >(["getAgentConfigurations", dustAPI.workspaceId()], agentConfigurationsFetcher);

  // Filter to only active agents and sort by name
  const agents = useMemo(() => {
    if (!data) return [];
    return data
      .filter((a) => a.status === "active")
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  return {
    agents,
    isAgentConfigurationsLoading: !error && !data,
    isAgentConfigurationsError: error,
    mutate,
    mutateRegardlessOfQueryParams,
  };
}
