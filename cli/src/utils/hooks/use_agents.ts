import type { GetAgentConfigurationsResponseType } from "@dust-tt/client";
import { useEffect, useState } from "react";

import { agentCache } from "../agentCache.js";
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

      // Try to get cached agents first
      const cachedAgents = await agentCache.get(workspaceId);
      if (cachedAgents) {
        setAllAgents(cachedAgents);
        setIsLoading(false);
        // Start background refresh
        void refreshAgentsInBackground(workspaceId);
        return;
      }

      // If no cache, fetch from API
      await fetchAndCacheAgents(workspaceId);
    }

    async function fetchAndCacheAgents(workspaceId: string) {
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

      const agents = agentsRes.value;
      setAllAgents(agents);
      setIsLoading(false);

      // Cache the results
      await agentCache.set(workspaceId, agents);
    }

    async function refreshAgentsInBackground(workspaceId: string) {
      try {
        const dustClient = await getDustClient();
        if (!dustClient) {
          return;
        }

        const agentsRes = await dustClient.getAgentConfigurations({});
        if (agentsRes.isErr()) {
          return;
        }

        const agents = agentsRes.value;
        await agentCache.set(workspaceId, agents);
        
        // Update state if the data has changed
        setAllAgents((currentAgents) => {
          if (JSON.stringify(agents) !== JSON.stringify(currentAgents)) {
            return agents;
          }
          return currentAgents;
        });
      } catch {
        // Ignore background refresh errors
      }
    }

    void fetchAgents();
  }, [isLoading, error, allAgents.length]);

  return { allAgents, error, isLoading, currentWorkspaceId };
}
