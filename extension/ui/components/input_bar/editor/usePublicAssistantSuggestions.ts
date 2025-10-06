import { compareAgentsForSort } from "@app/shared/lib/utils";
import { usePublicAgentConfigurations } from "@app/ui/components/assistants/usePublicAgentConfigurations";
import type { LightAgentConfigurationType } from "@dust-tt/client";
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
      description: agent.description,
    }));
}

export const usePublicAssistantSuggestions = (
  inListAgentConfigurations: LightAgentConfigurationType[]
) => {
  const { agentConfigurations, isAgentConfigurationsLoading } =
    usePublicAgentConfigurations();

  // `useMemo` will ensure that suggestions is only recalculated
  // when `inListAgentConfigurations` or `agentConfigurations` changes.
  const allSuggestions = useMemo(() => {
    const suggestions = makeEditorSuggestions(inListAgentConfigurations);
    const fallbackSuggestions = makeEditorSuggestions(agentConfigurations);

    return { suggestions, fallbackSuggestions };
  }, [agentConfigurations, inListAgentConfigurations]);

  return { ...allSuggestions, isLoading: isAgentConfigurationsLoading };
};
