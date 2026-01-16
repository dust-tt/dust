import type { LightAgentConfigurationType } from "@dust-tt/client";
import { useMemo } from "react";

import { createAgentConfigurationsFetcher } from "@app/shared/lib/fetchers";
import { transformAgentConfigurations } from "@app/shared/lib/hooks/useAgentConfigurationsCore";
import { useAuth } from "@/contexts/AuthContext";
import { useSWRWithDefaults } from "@/lib/swr";
import { useDustAPI } from "@/lib/useDustAPI";

export function useAgentConfigurations() {
  const { isAuthenticated } = useAuth();
  const dustAPI = useDustAPI({ disabled: !isAuthenticated });

  const fetcher = useMemo(
    () => createAgentConfigurationsFetcher(dustAPI),
    [dustAPI]
  );

  const { data, error, mutate, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults<
      ["getAgentConfigurations", string] | null,
      LightAgentConfigurationType[]
    >(
      dustAPI ? ["getAgentConfigurations", dustAPI.workspaceId()] : null,
      fetcher
    );

  // Filter to only active agents and sort using shared utility
  const agents = useMemo(() => transformAgentConfigurations(data), [data]);

  return {
    agents,
    isAgentConfigurationsLoading: !error && !data,
    isAgentConfigurationsError: error,
    mutate,
    mutateRegardlessOfQueryParams,
  };
}
