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
  RichAgentMentionInConversation,
  RichMention,
  RichUserMention,
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

    const expectedUsers = Math.round(
      ((position + 1) * users.length) / SUGGESTION_DISPLAY_LIMIT
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
    preferredAgentId?: string | null; // the prefered agent is the one mentioned by the user in his last message
    select?: {
      agents: boolean;
      users: boolean;
    };
  }
): Promise<RichMention[]> => {
  const normalizedQuery = query.toLowerCase();
  const currentUserSId = auth.getNonNullableUser().sId;

  const agentSuggestions: RichAgentMentionInConversation[] = [];
  let userSuggestions: RichUserMentionInConversation[] = [];
  let participantUsers: RichUserMention[] = [];
  let participantAgents: RichAgentMention[] = [];

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
          .map(
            (u) =>
              ({
                type: "user" as const,
                id: u.sId,
                label: u.fullName ?? u.username,
                pictureUrl: u.pictureUrl ?? "/static/humanavatar/anonymous.png",
                description: u.username,
              }) as RichUserMention
          );

        participantAgents = participants.agents.map(
          (a) =>
            ({
              type: "agent" as const,
              id: a.configurationId,
              label: a.name,
              pictureUrl: a.pictureUrl,
              description: "",
            }) as RichAgentMention
        );
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
      limit: SUGGESTION_DISPLAY_LIMIT,
    });

    if (res.isOk()) {
      const { users } = res.value;

      userSuggestions = users
        .filter((u) => u.sId !== currentUserSId)
        .map((u) => ({
          ...toRichUserMentionType(u.toJSON()),
          isParticipant: participantUsers.some((pu) => pu.id === u.sId),
        }))
        .sort((a, b) => {
          // If within the conversation participants, we move it to the top.
          if (a.isParticipant && !b.isParticipant) {
            return -1;
          }
          if (b.isParticipant && !a.isParticipant) {
            return 1;
          }
          return 0;
        });
    }
  }

  const selectedAgents = agentSuggestions.slice(0, SUGGESTION_DISPLAY_LIMIT);

  // If only one type is requested, keep the simple ordering.
  if (!select.agents && select.users) {
    return userSuggestions;
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
    return userSuggestions;
  }

  let results = interleaveMentionsPreservingAgentOrder(
    selectedAgents,
    userSuggestions
  );

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
