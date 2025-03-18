import type { LightAgentConfigurationType } from "@dust-tt/client";
import { usePublicAgentConfigurations } from "@extension/components/assistants/usePublicAgentConfigurations";
import { compareAgentsForSort } from "@extension/lib/utils";
import { useMemo } from "react";

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
      userFavorite: agent.userFavorite,
    }));
}

export const usePublicAssistantSuggestions = (
  inListAgentConfigurations: LightAgentConfigurationType[]
) => {
  const { agentConfigurations } = usePublicAgentConfigurations();

  // `useMemo` will ensure that suggestions is only recalculated
  // when `inListAgentConfigurations` or `agentConfigurations` changes.
  const allSuggestions = useMemo(() => {
    const suggestions = makeEditorSuggestions(inListAgentConfigurations);
    const fallbackSuggestions = makeEditorSuggestions(agentConfigurations);

    return { suggestions, fallbackSuggestions };
  }, [agentConfigurations, inListAgentConfigurations]);

  return allSuggestions;
};
