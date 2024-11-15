import { logout } from "@extension/lib/auth";
import { useDustAPI } from "@extension/lib/dust_api";
import { useSWRWithDefaults } from "@extension/lib/swr";
import { useEffect, useMemo } from "react";

export function usePublicAgentConfigurations() {
  const dustAPI = useDustAPI();

  const agentConfigurationsFetcher = async () => {
    const res = await dustAPI.getAgentConfigurations();
    if (res.isOk()) {
      return res.value;
    }
    throw new Error(res.error.message);
  };

  const { data, error, mutate, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(
      ["getAgentConfigurations", dustAPI.workspaceId()],
      agentConfigurationsFetcher
    );

  useEffect(() => {
    if (
      typeof error?.message === "string" &&
      error?.message.includes("User not found")
    ) {
      void logout();
    }
  }, [error]);

  return {
    agentConfigurations: useMemo(() => data ?? [], [data]),
    isAgentConfigurationsLoading: !error && !data,
    isAgentConfigurationsError: error,
    mutate,
    mutateRegardlessOfQueryParams,
  };
}
