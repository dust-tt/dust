import { searchAgents } from "@app/lib/api/agents/search";
import { getLastUserMessageMentions } from "@app/lib/api/assistant/conversation";
import { fetchConversationParticipants } from "@app/lib/api/assistant/participants";
import type { Authenticator } from "@app/lib/auth";
import {
  SUGGESTION_DISPLAY_LIMIT,
  SUGGESTION_PRIORITY,
  sortEditorSuggestionUsers,
} from "@app/lib/mentions/editor/suggestion";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { subFilter } from "@app/lib/utils";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type {
  RichAgentMentionInConversation,
  RichMention,
  RichUserMentionInConversation,
} from "@app/types/assistant/mentions";
import { toRichUserMentionType } from "@app/types/assistant/mentions";

export function interleaveMentionsPreservingAgentOrder(
  agents: RichAgentMentionInConversation[],
  users: RichUserMentionInConversation[],
  lowerCaseQuery: string = "",
  lastMentionedId: string | null = null,
  conversationId: string | null = null
): RichMention[] {
  if (users.length === 0) {
    return [...agents];
  }

  if (agents.length === 0) {
    return [...users];
  }

  let result: RichMention[] = [];

  let agentIndex = 0;
  let userIndex = 0;

  for (let position = 0; position < SUGGESTION_DISPLAY_LIMIT; position += 1) {
    // Break if we have exhausted both lists
    if (agentIndex >= agents.length && userIndex >= users.length) {
      break;
    }

    const nextUser = users[userIndex];
    const nextAgent = agents[agentIndex];

    // First fill in users participants
    if (nextUser?.isParticipant) {
      result.push(nextUser);
      userIndex += 1;
      continue;
    }

    // Then fill in agents participants
    if (nextAgent?.isParticipant) {
      result.push(nextAgent);
      agentIndex += 1;
      continue;
    }

    // If no more participants, prioritize users/agents who start with the query
    const nextUserStartsWithQuery =
      lowerCaseQuery &&
      nextUser?.label?.toLowerCase().startsWith(lowerCaseQuery);
    const nextAgentStartsWithQuery =
      lowerCaseQuery &&
      nextAgent?.label?.toLowerCase().startsWith(lowerCaseQuery);

    // Our high priority agents first
    if (
      nextAgentStartsWithQuery &&
      SUGGESTION_PRIORITY[nextAgent.id] !== undefined
    ) {
      result.push(nextAgent);
      agentIndex += 1;
      continue;
    }
    if (conversationId) {
      // In a conversation, prioritize users over agents.
      if (nextUserStartsWithQuery) {
        result.push(nextUser);
        userIndex += 1;
        continue;
      }
      if (nextAgentStartsWithQuery) {
        result.push(nextAgent);
        agentIndex += 1;
        continue;
      }
    } else {
      // Outside a conversation, prioritize agents over users.
      if (nextAgentStartsWithQuery) {
        result.push(nextAgent);
        agentIndex += 1;
        continue;
      }
      if (nextUserStartsWithQuery) {
        result.push(nextUser);
        userIndex += 1;
        continue;
      }
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

  // Move last mentioned agent to first position if specified
  if (lastMentionedId) {
    const lastMentioned =
      agents.find((s) => s.id === lastMentionedId) ??
      users.find((s) => s.id === lastMentionedId);
    if (lastMentioned) {
      result = [
        lastMentioned,
        ...result.filter((suggestion) => suggestion.id !== lastMentionedId),
      ];
    }
  }

  return result.slice(0, SUGGESTION_DISPLAY_LIMIT);
}

/**
 * Normalizes the `select` query parameter of the mention suggestions endpoint
 * into the `{ agents, users }` shape consumed by `suggestionsOfMentions`. The
 * parameter can come in as a single string ("agents"|"users"), an array of
 * those, or be absent (default: both).
 */
export function parseMentionSelectParam(
  selectParam: string | string[] | undefined
): { agents: boolean; users: boolean } {
  if (!selectParam) {
    return { agents: true, users: true };
  }

  if (typeof selectParam === "string") {
    return {
      agents: selectParam === "agents",
      users: selectParam === "users",
    };
  }

  return {
    agents: selectParam.includes("agents"),
    users: selectParam.includes("users"),
  };
}

/**
 * @cc [owner:aubin-tchoi,label:product;security] empty-query-favorite-mentions
 * With agents selected, a blank query MUST return only active,
 * readable favorites in alphabetical order when any exist, without searching. No favorites
 * or a nonblank query MUST retain the existing suggestions behavior.
 * Every agent suggestion MUST carry userFavorite, true iff the agent is a favorite of the caller.
 */
export async function suggestionsOfMentions(
  auth: Authenticator,
  {
    query,
    conversationId,
    spaceId,
    select = {
      agents: true,
      users: true,
    },
    current = false,
  }: {
    query: string;
    conversationId?: string | null;
    spaceId?: string | null;
    select?: {
      agents: boolean;
      users: boolean;
    };
    current?: boolean; // Include current user in suggestions
  }
): Promise<RichMention[]> {
  const normalizedQuery = query.toLowerCase();
  // can be called from the public API, so user may be null
  const currentUser = auth.user();

  if (select.agents && !query.trim()) {
    const favorites = await AgentResource.listFavoritesForCurrentUser(auth);
    const favoriteSuggestions = favorites
      .filter((agent) => agent.status === "active" && auth.can("read", agent))
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .slice(0, SUGGESTION_DISPLAY_LIMIT)
      .map((agent) => agent.toMentionSuggestionJSON({ userFavorite: true }));
    if (favoriteSuggestions.length > 0) {
      return favoriteSuggestions;
    }
  }

  // Id of the last user or agent mentioned by the current user in the conversation
  let lastMentionedId: string | null = null;

  const agentSuggestions: RichAgentMentionInConversation[] = [];
  const userSuggestions: RichUserMentionInConversation[] = [];
  let participantUsers: RichUserMentionInConversation[] = [];
  let participantAgents: RichAgentMentionInConversation[] = [];
  const projectMemberIds: Set<string> = new Set();

  // Get conversation participants if conversationId is provided
  // This aims to prioritize them in the suggestions
  if (conversationId) {
    const conversation = await ConversationResource.fetchById(
      auth,
      conversationId
    );

    if (conversation) {
      const participantsRes = await fetchConversationParticipants(
        auth,
        conversation
      );

      if (participantsRes.isOk()) {
        const participants = participantsRes.value;

        // Convert participants to RichMention format
        participantUsers = participants.users
          .filter((u) => current || u.sId !== currentUser?.sId)
          .map((u) => ({
            type: "user" as const,
            id: u.sId,
            label: u.fullName ?? u.username,
            pictureUrl: u.pictureUrl ?? "/static/humanavatar/anonymous.png",
            description: u.username,
            lastActivityAt: u.lastActivityAt,
            isParticipant: true,
          }));

        participantAgents = participants.agents.map((a) => ({
          type: "agent" as const,
          id: a.configurationId,
          label: a.name,
          pictureUrl: a.pictureUrl,
          description: "",
          lastActivityAt: a.lastActivityAt,
          isParticipant: true,
        }));

        // Get the last user message and check if it mentions one and only one agent
        // If yes, it will be prioritized in the suggestions.
        const lastUserMessageMentions = await getLastUserMessageMentions(
          auth,
          conversation
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

  // If the conversation belongs to a project, get the project members.
  // This aims to prioritize them in the suggestions
  if (spaceId) {
    const conversationSpace = await SpaceResource.fetchById(auth, spaceId);
    // Only prioritize members of a space the caller can read (and thus post in).
    const conversationGroups =
      conversationSpace && auth.can("read", conversationSpace)
        ? await conversationSpace.fetchMembershipGroups(auth)
        : [];

    const allMembers = await concurrentExecutor(
      conversationGroups,
      (group) => group.getActiveMembers(auth),
      { concurrency: 4 }
    );

    allMembers.flat().forEach((m) => projectMemberIds.add(m.sId));
  }

  if (select.agents) {
    const result = await searchAgents(auth, {
      searchTerm: query,
      limit: SUGGESTION_DISPLAY_LIMIT,
      sortBy: query.trim() ? "relevance" : "name",
      permissionFiltering: "strict",
    });
    if (result.isErr()) {
      throw result.error;
    }
    const favoriteIds = new Set(
      await AgentResource.listFavoriteIdsForCurrentUser(auth)
    );
    const searchResults: RichAgentMentionInConversation[] =
      result.value.agents.map((agent) => ({
        type: "agent",
        id: agent.sId,
        label: agent.name,
        pictureUrl: agent.pictureUrl,
        description: agent.description,
        userFavorite: favoriteIds.has(agent.sId),
      }));
    const searchResultsById = new Map(
      searchResults.map((agent) => [agent.id, agent])
    );
    const participantIds = new Set(participantAgents.map((agent) => agent.id));

    // Participants must be considered even when absent from the first search page.
    const participantConfigurations = await AgentResource.fetchByIds(auth, [
      ...participantIds,
    ]);
    const mentionableParticipantIds = new Set(
      participantConfigurations
        .filter((agent) => agent.status === "active" && auth.can("read", agent))
        .map((agent) => agent.sId)
    );
    const matchingParticipants = participantAgents
      .filter(
        (agent) =>
          mentionableParticipantIds.has(agent.id) &&
          (searchResultsById.has(agent.id) ||
            subFilter(normalizedQuery, agent.label.toLowerCase()))
      )
      .toSorted(
        (a, b) =>
          Number(b.id === lastMentionedId) - Number(a.id === lastMentionedId) ||
          (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0)
      );

    agentSuggestions.push(
      ...matchingParticipants.map((participant) => {
        const searchResult = searchResultsById.get(participant.id);
        return searchResult
          ? {
              ...searchResult,
              isParticipant: true,
              lastActivityAt: participant.lastActivityAt ?? 0,
            }
          : { ...participant, userFavorite: favoriteIds.has(participant.id) };
      }),
      ...searchResults
        .filter((agent) => !participantIds.has(agent.id))
        .map((agent) => ({
          ...agent,
          isParticipant: false,
          lastActivityAt: 0,
        }))
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

      const filteredUsers: RichUserMentionInConversation[] = users
        .filter((u) => current || u.sId !== currentUser?.sId)
        .map((u) => ({
          ...toRichUserMentionType(u.toJSON()),
          isParticipant: participantUsers.some((pu) => pu.id === u.sId),
          isProjectMember: spaceId ? projectMemberIds.has(u.sId) : undefined,
          lastActivityAt:
            participantUsers.find((pu) => pu.id === u.sId)?.lastActivityAt ?? 0,
        }));
      const sortedUsers = sortEditorSuggestionUsers(filteredUsers);
      if (!normalizedQuery) {
        // It's a special case when there's no query: all the conversation participants may not be in the users list (as it's limited).
        // We want to make sure to include them at the start of the suggestions (without duplicate).
        userSuggestions.push(
          ...participantUsers.filter(
            (pu) => !sortedUsers.some((su) => su.id === pu.id)
          )
        );
      }
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

  return interleaveMentionsPreservingAgentOrder(
    selectedAgents,
    userSuggestions,
    normalizedQuery,
    lastMentionedId,
    conversationId
  );
}
