import type { LightAgentConfigurationType } from "@dust-tt/types";
import { useMemo } from "react";

import { compareAgentsForSort } from "@app/lib/assistant";

function makeEditorSuggestions(
  agentConfigurations: LightAgentConfigurationType[]
) {
  return agentConfigurations
    .filter((a) => a.status === "active")
    .sort(compareAgentsForSort)
    .map((agent) => ({
      id: agent.sId,
      label: agent.name,
      pictureUrl: agent.pictureUrl,
    }));
}

const useAssistantSuggestions = (
  agentConfigurations: LightAgentConfigurationType[],
  inListAgentConfigurations: LightAgentConfigurationType[]
) => {
  // `useMemo` will ensure that suggestions is only recalculated
  // when `inListAgentConfigurations` or `agentConfigurations` changes.
  const allSuggestions = useMemo(() => {
    const suggestions = makeEditorSuggestions(inListAgentConfigurations);
    const fallbackSuggestions = makeEditorSuggestions(agentConfigurations);

    return { suggestions, fallbackSuggestions };
  }, [agentConfigurations, inListAgentConfigurations]);

  return allSuggestions;
};

export default useAssistantSuggestions;
