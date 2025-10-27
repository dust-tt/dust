import { useMemo } from "react";

import type {
  EditorSuggestion,
  EditorSuggestionAgent,
  EditorSuggestionUser,
} from "@app/components/assistant/conversation/input_bar/editor/suggestion";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import { useMembers } from "@app/lib/swr/memberships";
import type { LightAgentConfigurationType, WorkspaceType } from "@app/types";
import { compareAgentsForSort } from "@app/types";

function makeEditorSuggestionAgents(
  agentConfigurations: LightAgentConfigurationType[]
): EditorSuggestionAgent[] {
  return agentConfigurations
    .filter((a) => a.status === "active")
    .sort(compareAgentsForSort)
    .map((agent) => ({
      type: "agent",
      id: agent.sId,
      label: agent.name,
      pictureUrl: agent.pictureUrl,
      userFavorite: agent.userFavorite,
      description: agent.description,
    }));
}

function makeEditorSuggestionUsers(members: any[]): EditorSuggestionUser[] {
  return members
    .filter((member) => member.user)
    .map((member) => ({
      type: "user",
      id: String(member.user.id),
      label: member.user.fullName || member.user.username,
      pictureUrl: member.user.image || "",
      description: member.user.email || "",
    }));
}

const useAgentSuggestions = (
  inListAgentConfigurations: LightAgentConfigurationType[],
  owner: WorkspaceType
) => {
  // We use this specific hook because this component is involved in the new conversation page.
  const { agentConfigurations, isLoading: isLoadingAgents } =
    useUnifiedAgentConfigurations({
      workspaceId: owner.sId,
    });

  // Fetch workspace members for user mentions
  const { members, isLoading: isLoadingMembers } = useMembers(owner);

  // `useMemo` will ensure that suggestions are only recalculated
  // when `inListAgentConfigurations`, `agentConfigurations`, or `members` changes.
  const allSuggestions = useMemo(() => {
    const agentSuggestions = makeEditorSuggestionAgents(
      inListAgentConfigurations
    );
    const fallbackAgentSuggestions =
      makeEditorSuggestionAgents(agentConfigurations);
    const userSuggestions = makeEditorSuggestionUsers(members || []);

    // Combine agent and user suggestions
    const suggestions: EditorSuggestion[] = [
      ...agentSuggestions,
      ...userSuggestions,
    ];
    const fallbackSuggestions: EditorSuggestion[] = [
      ...fallbackAgentSuggestions,
      ...userSuggestions,
    ];

    return { suggestions, fallbackSuggestions };
  }, [agentConfigurations, inListAgentConfigurations, members]);

  return {
    ...allSuggestions,
    isLoading: isLoadingAgents || isLoadingMembers,
  };
};

export default useAgentSuggestions;
