import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { getMembers } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
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
    select = {
      agents: true,
      users: true,
    },
  }: {
    query: string;
    select?: {
      agents: boolean;
      users: boolean;
    };
  }
): Promise<RichMention[]> => {
  const agentSuggestions: RichAgentMention[] = [];
  const userSuggestions: RichUserMention[] = [];

  if (select.agents) {
    // Fetch agent configurations.
    const agentConfigurations = await getAgentConfigurationsForView({
      auth,
      agentsGetView: "list",
      variant: "light",
    });

    // Convert to RichAgentMention format.
    agentSuggestions.push(
      ...agentConfigurations
        .filter((a) => a.status === "active")
        .sort(compareAgentsForSort)
        .map(
          (agent) =>
            ({
              type: "agent",
              id: agent.sId,
              label: agent.name,
              pictureUrl: agent.pictureUrl,
              userFavorite: agent.userFavorite,
              description: agent.description,
            }) satisfies RichAgentMention
        )
    );
  }

  if (select.users) {
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

  const filteredAgents = filterAndSortEditorSuggestionAgents(
    query,
    agentSuggestions
  );

  const filteredUsers = filterAndSortUserSuggestions(query, userSuggestions);

  // Combine results: agents first, then users.
  const totalResults = [...filteredAgents, ...filteredUsers];
  return totalResults.slice(0, SUGGESTION_DISPLAY_LIMIT);
};
