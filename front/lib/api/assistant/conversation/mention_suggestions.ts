import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { fetchConversationParticipants } from "@app/lib/api/assistant/participants";
import type { Authenticator } from "@app/lib/auth";
import {
  filterAndSortEditorSuggestionAgents,
  SUGGESTION_DISPLAY_LIMIT,
} from "@app/lib/mentions/editor/suggestion";
import { UserResource } from "@app/lib/resources/user_resource";
import type {
  ConversationWithoutContentType,
  RichAgentMention,
  RichMention,
  RichUserMention,
} from "@app/types";
import { compareAgentsForSort } from "@app/types";

function reorderByIds<T extends { id: string }>(
  items: T[],
  favoredIds: Set<string>
): T[] {
  if (favoredIds.size === 0 || items.length === 0) {
    return items;
  }

  const favored: T[] = [];
  const others: T[] = [];

  for (const item of items) {
    if (favoredIds.has(item.id)) {
      favored.push(item);
    } else {
      others.push(item);
    }
  }

  return [...favored, ...others];
}

export const suggestionsOfMentions = async (
  auth: Authenticator,
  {
    query,
    select = {
      agents: true,
      users: true,
    },
    conversation,
  }: {
    query: string;
    select?: {
      agents: boolean;
      users: boolean;
    };
    conversation?: ConversationWithoutContentType | null;
  }
): Promise<RichMention[]> => {
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

      userSuggestions = users.map(
        (u) =>
          ({
            type: "user",
            id: u.sId,
            label: u.fullName() || u.email,
            pictureUrl: u.toJSON().image ?? "/static/humanavatar/anonymous.png",
            description: u.email,
          }) satisfies RichUserMention
      );
    }
  }

  let filteredAgents = filterAndSortEditorSuggestionAgents(
    query,
    agentSuggestions
  );

  // If we have a conversation context, favor participants (users and agents)
  // by moving them to the top of their respective lists.
  if (conversation && (select.users || select.agents)) {
    const participantsRes = await fetchConversationParticipants(
      auth,
      conversation
    );

    if (participantsRes.isOk()) {
      const participants = participantsRes.value;

      if (select.users && userSuggestions.length > 0) {
        const participantUserIds = new Set(participants.users.map((u) => u.sId));
        userSuggestions = reorderByIds(userSuggestions, participantUserIds);
      }

      if (select.agents && filteredAgents.length > 0) {
        const participantAgentIds = new Set(
          participants.agents.map((a) => a.configurationId)
        );

        filteredAgents = reorderByIds(filteredAgents, participantAgentIds);
      }
    }
  }

  // If only one type is requested, keep the simple ordering.
  if (!select.agents && select.users) {
    return userSuggestions.slice(0, SUGGESTION_DISPLAY_LIMIT);
  }
  if (select.agents && !select.users) {
    return filteredAgents.slice(0, SUGGESTION_DISPLAY_LIMIT);
  }

  // Both agents and users are requested.
  // If we have no users, fall back to agents
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

  return [...selectedUsers, ...selectedAgents];
};
