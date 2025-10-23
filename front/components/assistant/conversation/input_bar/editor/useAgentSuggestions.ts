import { useMemo } from "react";

import type { EditorSuggestionAgent } from "@app/components/assistant/conversation/input_bar/editor/suggestion";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import type { LightAgentConfigurationType, WorkspaceType } from "@app/types";
import { compareAgentsForSort } from "@app/types";

function makeEditorSuggestionAgents(
  agentConfigurations: LightAgentConfigurationType[]
): EditorSuggestionAgent[] {
  return agentConfigurations
    .filter((a) => a.status === "active")
    .sort(compareAgentsForSort)
    .map((agent) => ({
      id: agent.sId,
      label: agent.name,
      pictureUrl: agent.pictureUrl,
      userFavorite: agent.userFavorite,
      description: agent.description,
      type: "agent",
    }));
}

const useAgentSuggestions = (
  inListAgentConfigurations: LightAgentConfigurationType[],
  owner: WorkspaceType
) => {
  // We use this specific hook because this component is involved in the new conversation page.
  const { agentConfigurations, isLoading } = useUnifiedAgentConfigurations({
    workspaceId: owner.sId,
  });

  // `useMemo` will ensure that suggestions are only recalculated
  // when `inListAgentConfigurations` or `agentConfigurations` changes.
  const allSuggestions = useMemo(() => {
    const suggestions = makeEditorSuggestionAgents(inListAgentConfigurations);
    const fallbackSuggestions = makeEditorSuggestionAgents(agentConfigurations);

    return { suggestions, fallbackSuggestions };
  }, [agentConfigurations, inListAgentConfigurations]);

  return { ...allSuggestions, isLoading };
};

export default useAgentSuggestions;
