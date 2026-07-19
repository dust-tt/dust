import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { getLastUserMessageMentions } from "@app/lib/api/assistant/conversation";
import { fetchConversationParticipants } from "@app/lib/api/assistant/participants";
import type { Authenticator } from "@app/lib/auth";
import {
  filterAndSortEditorSuggestionAgents,
  interleaveMentionsPreservingAgentOrder,
  SUGGESTION_DISPLAY_LIMIT,
  sortEditorSuggestionUsers,
} from "@app/lib/mentions/editor/suggestion";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type {
  RichAgentMentionInConversation,
  RichMention,
  RichUserMentionInConversation,
} from "@app/types/assistant/mentions";
import {
  toRichAgentMentionType,
  toRichUserMentionType,
} from "@app/types/assistant/mentions";

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

export const suggestionsOfMentions = async (
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
): Promise<RichMention[]> => {
  const normalizedQuery = query.toLowerCase();
  // can be called from the public API, so user may be null
  const currentUser = auth.user();

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

  // If the conversation belongs to a project, get the project members.
  // This aims to prioritize them in the suggestions
  if (spaceId) {
    const conversationSpace = await SpaceResource.fetchById(auth, spaceId);

    const allMembers = await concurrentExecutor(
      conversationSpace?.groups.filter((g) => g.kind !== "global") ?? [],
      (group) => group.getActiveMembers(auth),
      { concurrency: 8 }
    );

    allMembers.flat().forEach((m) => projectMemberIds.add(m.sId));
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

    // The sidekick agent is excluded from default global agent listings but should
    // be mentionable when it's a conversation participant.
    const sidekickParticipant = participantAgents.find(
      (pa) => pa.id === GLOBAL_AGENTS_SID.SIDEKICK
    );
    if (sidekickParticipant) {
      activeAgents.push(sidekickParticipant);
    }

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
};
