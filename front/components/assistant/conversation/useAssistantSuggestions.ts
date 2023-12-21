// useAssistantSuggestions.js
import { WorkspaceType } from "@dust-tt/types";
import { useMemo } from "react";

import { compareAgentsForSort } from "@app/lib/assistant";
import { useAgentConfigurations } from "@app/lib/swr";

const useAssistantSuggestions = (
  owner: WorkspaceType,
  conversationId: string | null
) => {
  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: conversationId ? { conversationId } : "list",
  });

  // `useMemo` will ensure that suggestions is only recalculated when `agentConfigurations` changes.
  const suggestions = useMemo(() => {
    const activeAgents = agentConfigurations.filter(
      (a) => a.status === "active"
    );
    activeAgents.sort(compareAgentsForSort);

    return activeAgents.map((agent) => ({
      sId: agent.sId,
      pictureUrl: agent.pictureUrl,
      name: agent.name,
    }));
  }, [agentConfigurations]);

  return suggestions;
};

export default useAssistantSuggestions;
