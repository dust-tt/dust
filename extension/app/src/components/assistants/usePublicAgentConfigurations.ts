import { useAuthErrorCheck } from "@extension/hooks/useAuthErrorCheck";
import { useDustAPI } from "@extension/lib/dust_api";
import { useSWRWithDefaults } from "@extension/lib/swr";
import { useMemo } from "react";

export function usePublicAgentConfigurations() {
  const dustAPI = useDustAPI();

  const agentConfigurationsFetcher = async () => {
    const res = await dustAPI.getAgentConfigurations();
    if (res.isOk()) {
      return res.value;
    }
    throw res.error;
  };

  const { data, error, mutate, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(
      ["getAgentConfigurations", dustAPI.workspaceId()],
      agentConfigurationsFetcher
    );

  useAuthErrorCheck(error);

  return {
    agentConfigurations: useMemo(() => data ?? [], [data]),
    isAgentConfigurationsLoading: !error && !data,
    isAgentConfigurationsError: error,
    mutate,
    mutateRegardlessOfQueryParams,
  };
}
