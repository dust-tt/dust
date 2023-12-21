import { AgentConfigurationType } from "@dust-tt/types";
import { useMemo } from "react";

import { compareAgentsForSort } from "@app/lib/assistant";

const useAssistantSuggestions = (
  agentConfigurations: AgentConfigurationType[]
) => {
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
