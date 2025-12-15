import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { getLastUserMessageMentions } from "@app/lib/api/assistant/conversation";
import { fetchConversationParticipants } from "@app/lib/api/assistant/participants";
import type { Authenticator } from "@app/lib/auth";
import {
  filterAndSortEditorSuggestionAgents,
  sortEditorSuggestionUsers,
  SUGGESTION_DISPLAY_LIMIT,
} from "@app/lib/mentions/editor/suggestion";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type {
  RichAgentMentionInConversation,
  RichMention,
  RichUserMentionInConversation,
} from "@app/types";
import { toRichAgentMentionType, toRichUserMentionType } from "@app/types";

export function interleaveMentionsPreservingAgentOrder(
  agents: RichAgentMentionInConversation[],
  users: RichUserMentionInConversation[]
): RichMention[] {
  if (users.length === 0) {
    return [...agents];
  }

  if (agents.length === 0) {
    return [...users];
  }

  const result: RichMention[] = [];

  let agentIndex = 0;
  let userIndex = 0;

  for (let position = 0; position < SUGGESTION_DISPLAY_LIMIT; position += 1) {
    // Break if we have exhausted both lists
    if (agentIndex >= agents.length && userIndex >= users.length) {
      break;
    }

    // First fill in users participants
    if (users[userIndex]?.isParticipant) {
      result.push(users[userIndex]);
      userIndex += 1;
      continue;
    }

    // Then fill in agents participants
    if (agents[agentIndex]?.isParticipant) {
      result.push(agents[agentIndex]);
      agentIndex += 1;
      continue;
    }

    // Then interleave agents and users
    if (position % 3 === 2 && userIndex < users.length) {
      // Every 3rd position: add a user if available
      result.push(users[userIndex]);
      userIndex += 1;
    } else if (agentIndex < agents.length) {
      // Other positions: add an agent if available
      result.push(agents[agentIndex]);
      agentIndex += 1;
    } else if (userIndex < users.length) {
      // Fallback: if no agents left, add remaining users
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
    select = {
      agents: true,
      users: true,
    },
  }: {
    query: string;
    conversationId?: string | null;
    select?: {
      agents: boolean;
      users: boolean;
    };
  }
): Promise<RichMention[]> => {
  const normalizedQuery = query.toLowerCase();
  const currentUserSId = auth.getNonNullableUser().sId;

  // Id of the last user or agent mentioned by the current user in the conversation
  let lastMentionedId: string | null = null;

  const agentSuggestions: RichAgentMentionInConversation[] = [];
  const userSuggestions: RichUserMentionInConversation[] = [];
  let participantUsers: RichUserMentionInConversation[] = [];
  let participantAgents: RichAgentMentionInConversation[] = [];

  // Get conversation participants if conversationId is provided
  // This aims to prioritize them in the suggestions
  if (conversationId) {
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

        // Convert participants to RichMention format
        participantUsers = participants.users
          .filter((u) => u.sId !== currentUserSId)
          .map((u) => ({
            type: "user" as const,
            id: u.sId,
            label: u.fullName ?? u.username,
            pictureUrl: u.pictureUrl ?? "/static/humanavatar/anonymous.png",
            description: u.username,
            lastActivityAt: u.lastActivityAt,
          }));

        participantAgents = participants.agents.map((a) => ({
          type: "agent" as const,
          id: a.configurationId,
          label: a.name,
          pictureUrl: a.pictureUrl,
          description: "",
          lastActivityAt: a.lastActivityAt,
        }));

        // Get the last user message and check if it mentions one and only one agent
        // If yes, it will be prioritized in the suggestions.
        const lastUserMessageMentions = await getLastUserMessageMentions(
          auth,
          conversationRes.value
        );
        if (
          lastUserMessageMentions.isOk() &&
          lastUserMessageMentions.value.length === 1
        ) {
          lastMentionedId = lastUserMessageMentions.value[0];
        }
      }
    }
  }

  if (select.agents) {
    const agentConfigurations = await getAgentConfigurationsForView({
      auth,
      agentsGetView: "list",
      variant: "light",
    });

    const activeAgents: RichAgentMentionInConversation[] = agentConfigurations
      .filter((a) => a.status === "active")
      .map((a) => ({
        ...toRichAgentMentionType(a),
        isParticipant: participantAgents.some((pa) => pa.id === a.sId),
        lastActivityAt:
          participantAgents.find((pa) => pa.id === a.sId)?.lastActivityAt ?? 0,
      }));

    const filteredAgents = filterAndSortEditorSuggestionAgents(
      normalizedQuery,
      activeAgents
    );

    agentSuggestions.push(...filteredAgents);
  }

  if (select.users) {
    const res = await UserResource.searchUsers(auth, {
      searchTerm: query,
      offset: 0,
    });

    if (res.isOk()) {
      const { users } = res.value;

      const filteredUsers: RichUserMentionInConversation[] = users
        .filter((u) => u.sId !== currentUserSId)
        .map((u) => ({
          ...toRichUserMentionType(u.toJSON()),
          isParticipant: participantUsers.some((pu) => pu.id === u.sId),
          lastActivityAt:
            participantUsers.find((pu) => pu.id === u.sId)?.lastActivityAt ?? 0,
        }));
      const sortedUsers = sortEditorSuggestionUsers(filteredUsers);
      userSuggestions.push(...sortedUsers);
    }
  }

  const selectedAgents = agentSuggestions.slice(0, SUGGESTION_DISPLAY_LIMIT);

  // If only one type is requested, keep the simple ordering.
  if (!select.agents && select.users) {
    return userSuggestions.slice(0, SUGGESTION_DISPLAY_LIMIT);
  }
  if (select.agents && !select.users) {
    return selectedAgents;
  }

  // Both agents and users are requested.
  // If we have no users, fall back to agents.
  if (userSuggestions.length === 0) {
    return selectedAgents;
  }

  // No agent suggestions available, fallback to users.
  if (selectedAgents.length === 0) {
    return userSuggestions.slice(0, SUGGESTION_DISPLAY_LIMIT);
  }

  let results = interleaveMentionsPreservingAgentOrder(
    selectedAgents,
    userSuggestions
  );

  // Move last mentioned agent to first position if specified
  if (lastMentionedId) {
    const preferredIndex = results.findIndex((s) => s.id === lastMentionedId);
    if (preferredIndex > 0) {
      const preferred = results[preferredIndex];
      results = [preferred, ...results.filter((_, i) => i !== preferredIndex)];
    }
  }

  return results;
};
