import { useMemo } from "react";

import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import type { LightAgentConfigurationType, WorkspaceType } from "@app/types";
import { compareAgentsForSort } from "@app/types";

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

const useAssistantSuggestions = (
  inListAgentConfigurations: LightAgentConfigurationType[],
  owner: WorkspaceType
) => {
  // We use this specific hook because this component is involved in the new conversation page.
  const { agentConfigurations, isLoading } = useUnifiedAgentConfigurations({
    workspaceId: owner.sId,
  });

  // `useMemo` will ensure that suggestions is only recalculated
  // when `inListAgentConfigurations` or `agentConfigurations` changes.
  const allSuggestions = useMemo(() => {
    const suggestions = makeEditorSuggestions(inListAgentConfigurations);
    const fallbackSuggestions = makeEditorSuggestions(agentConfigurations);

    return { suggestions, fallbackSuggestions };
  }, [agentConfigurations, inListAgentConfigurations]);

  return { ...allSuggestions, isLoading };
};

export default useAssistantSuggestions;
