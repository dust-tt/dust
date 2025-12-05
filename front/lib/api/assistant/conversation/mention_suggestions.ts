import shuffle from "lodash/shuffle";

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
import {
  compareAgentsForSort,
  toRichAgentMentionType,
  toRichUserMentionType,
} from "@app/types";

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

      userSuggestions.push(
        ...users.map((u) => toRichUserMentionType(u.toJSON()))
      );
    }
  }

  let filteredAgents = filterAndSortEditorSuggestionAgents(
    normalizedQuery,
    agentSuggestions
  );

  // If we have a conversation context, favor participants (users and agents)
  // by moving them to the top of their respective lists.
  let participantUserIds: Set<string> | null = null;
  let participantAgentIds: Set<string> | null = null;
  if (conversation && (select.users || select.agents)) {
    const participantsRes = await fetchConversationParticipants(
      auth,
      conversation
    );

    if (participantsRes.isOk()) {
      const participants = participantsRes.value;

      if (select.users) {
        participantUserIds = new Set(
          participants.users
            .map((u) => u.sId)
            .filter((id) => id !== currentUserSId)
        );

        const participantUserMentions: RichUserMention[] = participants.users
          .filter((u) => u.sId !== currentUserSId)
          .map(
            (u) =>
              ({
                type: "user",
                id: u.sId,
                label: u.fullName || u.username,
                pictureUrl: u.pictureUrl ?? "/static/humanavatar/anonymous.png",
                description: u.username,
              }) satisfies RichUserMention
          )
          .filter((m) =>
            normalizedQuery
              ? m.label.toLowerCase().includes(normalizedQuery)
              : true
          );

        const existingUserIds = new Set(userSuggestions.map((u) => u.id));

        const enrichedUsers: RichUserMention[] = [
          ...participantUserMentions.filter((m) => !existingUserIds.has(m.id)),
          ...userSuggestions,
        ];

        userSuggestions = reorderByIds(enrichedUsers, participantUserIds);
      }

      if (select.agents && filteredAgents.length > 0) {
        participantAgentIds = new Set(
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
  // If we have no users, fall back to agents.
  if (userSuggestions.length === 0) {
    return filteredAgents.slice(0, SUGGESTION_DISPLAY_LIMIT);
  }

  // Build a participant tier (up to 5 items) when we have conversation context.
  const participantMentions: RichMention[] = [];
  const participantUserIdSet = participantUserIds ?? new Set<string>();
  const participantAgentIdSet = participantAgentIds ?? new Set<string>();

  if (conversation) {
    const participantUsers =
      participantUserIds === null
        ? []
        : userSuggestions.filter((u) => participantUserIdSet.has(u.id));
    const participantAgents =
      participantAgentIds === null
        ? []
        : filteredAgents.filter((a) => participantAgentIdSet.has(a.id));

    participantMentions.push(...participantUsers, ...participantAgents);
  }

  const uniqueParticipantIds = new Set(
    participantMentions.map((m) => `${m.type}:${m.id}`)
  );

  const cappedParticipantMentions = participantMentions.slice(
    0,
    Math.min(5, SUGGESTION_DISPLAY_LIMIT)
  );

  const remainingLimit =
    SUGGESTION_DISPLAY_LIMIT - cappedParticipantMentions.length;
  if (remainingLimit <= 0) {
    return cappedParticipantMentions;
  }

  // Remove participants from the remaining pools to avoid duplicates.
  const remainingUsers = userSuggestions.filter(
    (u) => !uniqueParticipantIds.has(`user:${u.id}`)
  );
  const remainingAgents = filteredAgents.filter(
    (a) => !uniqueParticipantIds.has(`agent:${a.id}`)
  );

  // Compute a target 30% / 70% split over the remaining slots.
  const totalAvailableRest = remainingAgents.length + remainingUsers.length;
  const maxResultsRest = Math.min(remainingLimit, totalAvailableRest);

  const targetUserCountRest = Math.min(
    remainingUsers.length,
    Math.round(0.3 * maxResultsRest)
  );
  const targetAgentCountRest = Math.min(
    remainingAgents.length,
    maxResultsRest - targetUserCountRest
  );

  const selectedUsersRest = remainingUsers.slice(0, targetUserCountRest);
  const selectedAgentsRest = remainingAgents.slice(0, targetAgentCountRest);

  const rest: RichMention[] = shuffle<RichMention>([
    ...selectedUsersRest,
    ...selectedAgentsRest,
  ]);

  return [...cappedParticipantMentions, ...rest];
};
