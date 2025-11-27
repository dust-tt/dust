import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { getMembers } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import {
  filterAndSortEditorSuggestionAgents,
  filterAndSortUserSuggestions,
  SUGGESTION_DISPLAY_LIMIT,
} from "@app/lib/mentions/editor/suggestion";
import type {
  RichAgentMention,
  RichMention,
  RichUserMention,
} from "@app/types";
import { compareAgentsForSort } from "@app/types";

export const suggestionsOfMentions = async (
  auth: Authenticator,
  {
    query,
  }: {
    query: string;
  }
): Promise<RichMention[]> => {
  // Fetch agent configurations.
  const agentConfigurations = await getAgentConfigurationsForView({
    auth,
    agentsGetView: "list",
    variant: "light",
  });

  // Convert to RichAgentMention format.
  const agentSuggestions: RichAgentMention[] = agentConfigurations
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

  // Fetch workspace members if mentions_v2 is enabled.
  const userSuggestions: RichUserMention[] = [];
  const workspace = auth.getNonNullableWorkspace();
  const featureFlags = await getFeatureFlags(workspace);
  const mentions_v2_enabled = featureFlags.includes("mentions_v2");

  if (mentions_v2_enabled) {
    const { members } = await getMembers(auth, { activeOnly: true });

    userSuggestions.push(
      ...members.map(
        (member) =>
          ({
            type: "user",
            id: member.sId,
            label: member.fullName || member.email,
            pictureUrl: member.image ?? "/static/humanavatar/anonymous.png",
            description: member.email,
          }) satisfies RichUserMention
      )
    );
  }

  // Filter and sort agents.
  const filteredAgents = filterAndSortEditorSuggestionAgents(
    query,
    agentSuggestions
  );

  // Filter and sort users.
  const filteredUsers = filterAndSortUserSuggestions(query, userSuggestions);

  // Combine results: agents first, then users.
  const totalResults = [...filteredAgents, ...filteredUsers];
  const suggestions = totalResults.slice(0, SUGGESTION_DISPLAY_LIMIT);
  return suggestions as RichMention[];
};
