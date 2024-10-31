import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@dust-tt/types";
import { compareAgentsForSort } from "@dust-tt/types";
import { usePublicAgentConfigurations } from "@extension/components/assistants/usePublicAgentConfigurations";
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
    }));
}

export const usePublicAssistantSuggestions = (
  inListAgentConfigurations: LightAgentConfigurationType[],
  owner: LightWorkspaceType
) => {
  const { agentConfigurations } = usePublicAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
  });

  // `useMemo` will ensure that suggestions is only recalculated
  // when `inListAgentConfigurations` or `agentConfigurations` changes.
  const allSuggestions = useMemo(() => {
    const suggestions = makeEditorSuggestions(inListAgentConfigurations);
    const fallbackSuggestions = makeEditorSuggestions(agentConfigurations);

    return { suggestions, fallbackSuggestions };
  }, [agentConfigurations, inListAgentConfigurations]);

  return allSuggestions;
};
