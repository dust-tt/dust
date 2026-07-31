import {
  compareAgentsForSort,
  GLOBAL_AGENTS_SID,
} from "@app/types/assistant/assistant";
import type {
  RichAgentMention,
  RichAgentMentionInConversation,
  RichMention,
  RichUserMentionInConversation,
} from "@app/types/assistant/mentions";

import { compareForFuzzySort, subFilter } from "../../utils";

/**
 * Maximum number of suggestions to display in the autocomplete dropdown.
 */
export const SUGGESTION_DISPLAY_LIMIT = 20;

/**
 * Priority order for specific agent suggestions.
 * Lower numbers appear first in the list when within the display limit.
 */
export const SUGGESTION_PRIORITY: Record<string, number> = {
  [GLOBAL_AGENTS_SID.DUST]: 1,
  [GLOBAL_AGENTS_SID.DEEP_DIVE]: 2,
};

export function interleaveMentionsPreservingAgentOrder(
  agents: RichAgentMentionInConversation[],
  users: RichUserMentionInConversation[],
  lowerCaseQuery: string = "",
  lastMentionedId: string | null = null,
  conversationId: string | null = null
): RichMention[] {
  if (users.length === 0) {
    return agents.slice(0, SUGGESTION_DISPLAY_LIMIT);
  }

  if (agents.length === 0) {
    return users.slice(0, SUGGESTION_DISPLAY_LIMIT);
  }

  let result: RichMention[] = [];
  let agentIndex = 0;
  let userIndex = 0;

  for (let position = 0; position < SUGGESTION_DISPLAY_LIMIT; position += 1) {
    if (agentIndex >= agents.length && userIndex >= users.length) {
      break;
    }

    const nextUser = users[userIndex];
    const nextAgent = agents[agentIndex];

    if (nextUser?.isParticipant) {
      result.push(nextUser);
      userIndex += 1;
      continue;
    }

    if (nextAgent?.isParticipant) {
      result.push(nextAgent);
      agentIndex += 1;
      continue;
    }

    const nextUserStartsWithQuery =
      lowerCaseQuery &&
      nextUser?.label?.toLowerCase().startsWith(lowerCaseQuery);
    const nextAgentStartsWithQuery =
      lowerCaseQuery &&
      nextAgent?.label?.toLowerCase().startsWith(lowerCaseQuery);

    if (
      nextAgentStartsWithQuery &&
      SUGGESTION_PRIORITY[nextAgent.id] !== undefined
    ) {
      result.push(nextAgent);
      agentIndex += 1;
      continue;
    }
    if (conversationId) {
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

    if (position % 3 === 2 && userIndex < users.length) {
      result.push(users[userIndex]);
      userIndex += 1;
    } else if (agentIndex < agents.length) {
      result.push(agents[agentIndex]);
      agentIndex += 1;
    } else if (userIndex < users.length) {
      result.push(users[userIndex]);
      userIndex += 1;
    }
  }

  if (lastMentionedId) {
    const lastMentioned =
      agents.find((suggestion) => suggestion.id === lastMentionedId) ??
      users.find((suggestion) => suggestion.id === lastMentionedId);
    if (lastMentioned) {
      result = [
        lastMentioned,
        ...result.filter((suggestion) => suggestion.id !== lastMentionedId),
      ];
    }
  }

  return result.slice(0, SUGGESTION_DISPLAY_LIMIT);
}

function compareAgentSuggestionsForSort(
  a: RichAgentMention,
  b: RichAgentMention
) {
  const toSortable = (a: RichAgentMention) => {
    return {
      sId: a.id,
      userFavorite: a.userFavorite,
      scope: "visible",
      name: a.label,
    } as const;
  };
  return compareAgentsForSort(toSortable(a), toSortable(b));
}

/**
 * Filters and orders agent suggestions:
 * 1. Agents in the conversation (most recent activity first)
 * 2. Priority mapping
 * 3. User favorite agents
 * 4. Fuzzy match score
 */
export function filterAndSortEditorSuggestionAgents(
  lowerCaseQuery: string,
  suggestions: RichAgentMentionInConversation[]
) {
  return suggestions
    .filter((item) => subFilter(lowerCaseQuery, item.label.toLowerCase()))
    .sort((a, b) => {
      // First we prioritize agents that are in the conversation
      if (a.isParticipant && !b.isParticipant) {
        return -1;
      }
      if (b.isParticipant && !a.isParticipant) {
        return 1;
      }
      if (a.isParticipant && b.isParticipant) {
        return (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0);
      }

      // Then we prioritize agents based on the SUGGESTION_PRIORITY mapping
      const aPriority = SUGGESTION_PRIORITY[a.id];
      const bPriority = SUGGESTION_PRIORITY[b.id];
      if (aPriority || bPriority) {
        return (
          (aPriority ?? Number.MAX_SAFE_INTEGER) -
          (bPriority ?? Number.MAX_SAFE_INTEGER)
        );
      }

      // Then we prioritize user favorite agents
      if (a.userFavorite && !b.userFavorite) {
        return -1;
      }
      if (b.userFavorite && !a.userFavorite) {
        return 1;
      }

      return (
        compareForFuzzySort(
          lowerCaseQuery,
          a.label.toLocaleLowerCase(),
          b.label.toLocaleLowerCase()
        ) || compareAgentSuggestionsForSort(a, b)
      );
    });
}

export function filterEditorSuggestionUsers(
  lowerCaseQuery: string,
  suggestions: RichUserMentionInConversation[]
) {
  return suggestions.filter(
    (item) =>
      subFilter(lowerCaseQuery, item.label.toLowerCase()) ||
      subFilter(lowerCaseQuery, item.description.toLowerCase())
  );
}

export function sortEditorSuggestionUsers(
  suggestions: RichUserMentionInConversation[]
) {
  return suggestions.sort((a, b) => {
    // If within the conversation participants, we move it to the top.
    if (a.isParticipant && !b.isParticipant) {
      return -1;
    }
    if (b.isParticipant && !a.isParticipant) {
      return 1;
    }
    // If both are participants, we sort by last activity.
    if (a.isParticipant && b.isParticipant) {
      return (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0);
    }
    // If project members, we move them up.
    if (a.isProjectMember && !b.isProjectMember) {
      return -1;
    }
    if (b.isProjectMember && !a.isProjectMember) {
      return 1;
    }
    // If both are project members, we sort by last activity.
    if (a.isProjectMember && b.isProjectMember) {
      return (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0);
    }
    return 0;
  });
}
