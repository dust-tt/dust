import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { fetchConversationParticipants } from "@app/lib/api/assistant/participants";
import type { Authenticator } from "@app/lib/auth";
import {
  filterAndSortEditorSuggestionAgents,
  SUGGESTION_DISPLAY_LIMIT,
} from "@app/lib/mentions/editor/suggestion";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type {
  RichAgentMention,
  RichMention,
  RichUserMention,
} from "@app/types";
import {
  compareAgentsForSort,
  toRichAgentMentionType,
  toRichUserMentionType,
} from "@app/types";

const USER_RATIO = 0.3;
const MIN_USER_COUNT = 1;

export function interleaveMentionsPreservingAgentOrder(
  agents: RichAgentMention[],
  users: RichUserMention[]
): RichMention[] {
  if (users.length === 0) {
    return [...agents];
  }

  if (agents.length === 0) {
    return [...users];
  }

  const totalSlots = agents.length + users.length;
  const result: RichMention[] = [];

  let agentIndex = 0;
  let userIndex = 0;

  for (let position = 0; position < totalSlots; position += 1) {
    if (position === 0) {
      result.push(agents[agentIndex]);
      agentIndex += 1;
      continue;
    }

    const expectedUsers = Math.round(
      ((position + 1) * users.length) / totalSlots
    );

    if (userIndex < users.length && userIndex < expectedUsers) {
      result.push(users[userIndex]);
      userIndex += 1;
      continue;
    }

    if (agentIndex < agents.length) {
      result.push(agents[agentIndex]);
      agentIndex += 1;
      continue;
    }

    if (userIndex < users.length) {
      result.push(users[userIndex]);
      userIndex += 1;
    }
  }

  return result;
}

export const suggestionsOfMentions = async (
  auth: Authenticator,
  {
    query,
    conversationId,
    preferredAgentId,
    select = {
      agents: true,
      users: true,
    },
  }: {
    query: string;
    conversationId?: string | null;
    preferredAgentId?: string | null;
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
        .map(toRichAgentMentionType)
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
        .map((u) => toRichUserMentionType(u.toJSON()));
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

  const selectedAgents = filteredAgents.slice(0, SUGGESTION_DISPLAY_LIMIT);

  // No agent suggestions available, fallback to users.
  if (selectedAgents.length === 0) {
    return userSuggestions.slice(0, SUGGESTION_DISPLAY_LIMIT);
  }

  const targetUserCount = Math.min(
    userSuggestions.length,
    Math.max(MIN_USER_COUNT, Math.round(USER_RATIO * selectedAgents.length))
  );
  const selectedUsers = userSuggestions.slice(0, targetUserCount);

  let results: RichMention[] = interleaveMentionsPreservingAgentOrder(
    selectedAgents,
    selectedUsers
  );

  // Apply conversation participant prioritization if conversationId is provided
  // This only runs when mentions_v2 is enabled (select.users === true)
  if (conversationId && select.users) {
    const conversationRes =
      await ConversationResource.fetchConversationWithoutContent(
        auth,
        conversationId
      );

    if (conversationRes.isOk()) {
      const participantsRes = await fetchConversationParticipants(
        auth,
        conversationRes.value
      );

      if (participantsRes.isOk()) {
        const participants = participantsRes.value;
        const matchesQuery = (label: string) =>
          !normalizedQuery || label.toLowerCase().includes(normalizedQuery);

        // Convert participants to RichMention format
        const participantUsers = participants.users
          .filter((u) => u.sId !== currentUserSId)
          .map((u) => ({
            type: "user" as const,
            id: u.sId,
            label: u.fullName ?? u.username,
            pictureUrl: u.pictureUrl ?? "/static/humanavatar/anonymous.png",
            description: u.username,
          }))
          .filter((m) => matchesQuery(m.label));

        const participantAgents = participants.agents
          .map((a) => ({
            type: "agent" as const,
            id: a.configurationId,
            label: a.name,
            pictureUrl: a.pictureUrl,
            description: "",
            userFavorite: false,
          }))
          .filter((m) => matchesQuery(m.label));

        // Find participants not already in results
        const key = (m: { type: string; id: string }) => `${m.type}:${m.id}`;
        const existingKeys = new Set(results.map(key));

        const MAX_TOP_PARTICIPANTS = 5;
        const MAX_TOP_USERS = 3;

        const newUserParticipants = participantUsers.filter(
          (m) => !existingKeys.has(key(m))
        );
        const cappedUserParticipants = newUserParticipants.slice(
          0,
          MAX_TOP_USERS
        );

        const remainingSlots =
          MAX_TOP_PARTICIPANTS - cappedUserParticipants.length;

        const newAgentParticipants = participantAgents.filter(
          (m) => !existingKeys.has(key(m))
        );
        const cappedAgentParticipants =
          remainingSlots > 0
            ? newAgentParticipants.slice(0, remainingSlots)
            : [];

        const cappedParticipants = [
          ...cappedUserParticipants,
          ...cappedAgentParticipants,
        ];

        // Prepend conversation participants to the results
        results = [...cappedParticipants, ...results];
      }
    }
  }

  // Move preferred agent to first position if specified
  if (preferredAgentId) {
    const preferredIndex = results.findIndex(
      (s) => s.type === "agent" && s.id === preferredAgentId
    );
    if (preferredIndex > 0) {
      const preferred = results[preferredIndex];
      results = [preferred, ...results.filter((_, i) => i !== preferredIndex)];
    }
  }

  return results;
};
