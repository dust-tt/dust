import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { dustApi } from "@/lib/services/api";
import type { LightAgentConfiguration } from "@/lib/types/conversations";

interface UseAgentConfigurationsState {
  agents: LightAgentConfiguration[];
  isLoading: boolean;
  error: string | null;
}

export function useAgentConfigurations() {
  const { user } = useAuth();
  const [state, setState] = useState<UseAgentConfigurationsState>({
    agents: [],
    isLoading: false,
    error: null,
  });

  const fetchAgents = useCallback(async () => {
    if (!user?.dustDomain || !user?.selectedWorkspace) {
      return;
    }

    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    const result = await dustApi.getAgentConfigurations(
      user.dustDomain,
      user.selectedWorkspace
    );

    if (result.isOk) {
      // Filter to only active agents and sort by name
      const activeAgents = result.value
        .filter((a) => a.status === "active")
        .sort((a, b) => a.name.localeCompare(b.name));

      setState({
        agents: activeAgents,
        isLoading: false,
        error: null,
      });
    } else {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: result.error.message,
      }));
    }
  }, [user?.dustDomain, user?.selectedWorkspace]);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  return {
    ...state,
    refresh: fetchAgents,
  };
}
