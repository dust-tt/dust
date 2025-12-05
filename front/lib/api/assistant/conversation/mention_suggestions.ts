import shuffle from "lodash/shuffle";

import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import type { Authenticator } from "@app/lib/auth";
import {
  filterAndSortEditorSuggestionAgents,
  SUGGESTION_DISPLAY_LIMIT,
} from "@app/lib/mentions/editor/suggestion";
import { UserResource } from "@app/lib/resources/user_resource";
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
  const normalizedQuery = query.toLowerCase();
  const currentUserSId = auth.getNonNullableUser().sId;

  const agentSuggestions: RichAgentMention[] = [];
  let userSuggestions: RichUserMention[] = [];

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
    const res = await UserResource.searchUsers(auth, {
      searchTerm: query,
      offset: 0,
      limit: SUGGESTION_DISPLAY_LIMIT,
    });

    if (res.isOk()) {
      const { users } = res.value;

      userSuggestions = users
        .filter((u) => u.sId !== currentUserSId)
        .map(
          (u) =>
            ({
              type: "user",
              id: u.sId,
              label: u.fullName() || u.email,
              pictureUrl:
                u.toJSON().image ?? "/static/humanavatar/anonymous.png",
              description: u.email,
            }) satisfies RichUserMention
        );
    }
  }

  const filteredAgents = filterAndSortEditorSuggestionAgents(
    normalizedQuery,
    agentSuggestions
  );

  // If only one type is requested, keep the simple ordering.
  if (!select.agents && select.users) {
    return userSuggestions.slice(0, SUGGESTION_DISPLAY_LIMIT);
  }
  if (select.agents && !select.users) {
    return filteredAgents.slice(0, SUGGESTION_DISPLAY_LIMIT);
  }

  // Both agents and users are requested.
  // If we have no users, fall back to agents.
  if (userSuggestions.length === 0) {
    return filteredAgents.slice(0, SUGGESTION_DISPLAY_LIMIT);
  }

  // Compute a target 30% / 70% split over the first N items.
  const totalAvailable = filteredAgents.length + userSuggestions.length;
  const maxResults = Math.min(SUGGESTION_DISPLAY_LIMIT, totalAvailable);

  const targetUserCount = Math.min(
    userSuggestions.length,
    Math.max(1, Math.round(0.3 * maxResults))
  );
  const targetAgentCount = Math.min(
    filteredAgents.length,
    maxResults - targetUserCount
  );

  const selectedUsers = userSuggestions.slice(0, targetUserCount);
  const selectedAgents = filteredAgents.slice(0, targetAgentCount);

  // Mix users and agents with a simple shuffle while:
  // - preserving the 30/70 counts
  // - keeping the first item as a user when possible.
  if (selectedUsers.length === 0) {
    return [...selectedAgents];
  }

  const [firstUser, ...remainingUsers] = selectedUsers;

  const rest: RichMention[] = shuffle<RichMention>([
    ...remainingUsers,
    ...selectedAgents,
  ]);

  return [firstUser, ...rest];
};
