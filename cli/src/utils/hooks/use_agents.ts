import type { GetAgentConfigurationsResponseType } from "@dust-tt/client";
import { useEffect, useState } from "react";

import AuthService from "../authService.js";
import { getDustClient } from "../dustClient.js";
type AgentConfiguration =
  GetAgentConfigurationsResponseType["agentConfigurations"][number];

export function useAgents() {
  const [allAgents, setAllAgents] = useState<AgentConfiguration[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(
    null
  );

  useEffect(() => {
    async function fetchAgents() {
      if (isLoading || error || allAgents.length > 0) {
        return;
      }

      setIsLoading(true);
      setError(null);

      const workspaceId = await AuthService.getSelectedWorkspaceId();
      if (!workspaceId) {
        setError(
          "No workspace selected. Run `dust login` to select a workspace."
        );
        setIsLoading(false);
        return;
      }
      setCurrentWorkspaceId(workspaceId);

      const dustClient = await getDustClient();
      if (!dustClient) {
        setError("Authentication required. Run `dust login` first.");
        setIsLoading(false);
        return;
      }

      const agentsRes = await dustClient.getAgentConfigurations({});

      if (agentsRes.isErr()) {
        setError(`API Error fetching agents: ${agentsRes.error.message}`);
        setIsLoading(false);
        return;
      }

      setAllAgents(agentsRes.value);
      setIsLoading(false);
    }

    void fetchAgents();
  }, [isLoading, error, allAgents.length]);

  return { allAgents, error, isLoading, currentWorkspaceId };
}
