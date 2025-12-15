import type {
  RichAgentMention,
  RichAgentMentionInConversation,
} from "@app/types";
import { compareAgentsForSort, GLOBAL_AGENTS_SID } from "@app/types";

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
 * 1. Agents in the conversation
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
