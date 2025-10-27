import { compareForFuzzySort, subFilter } from "@app/lib/utils";
import { GLOBAL_AGENTS_SID } from "@app/types";

import type { RichAgentMention, RichMention } from "../types";
import { isRichAgentMention } from "../types";

/**
 * Maximum number of suggestions to display in the autocomplete dropdown.
 */
const SUGGESTION_DISPLAY_LIMIT = 7;

/**
 * Priority order for specific agent suggestions.
 * Lower numbers appear first in the list when within the display limit.
 */
const SUGGESTION_PRIORITY: Record<string, number> = {
  [GLOBAL_AGENTS_SID.DUST]: 1,
  [GLOBAL_AGENTS_SID.DEEP_DIVE]: 2,
};

/**
 * Filters and sorts agent mention suggestions based on a query string.
 */
function filterAndSortAgentSuggestions(
  lowerCaseQuery: string,
  suggestions: RichAgentMention[]
): RichAgentMention[] {
  return suggestions
    .filter((item) => subFilter(lowerCaseQuery, item.label.toLowerCase()))
    .sort((a, b) =>
      compareForFuzzySort(
        lowerCaseQuery,
        a.label.toLocaleLowerCase(),
        b.label.toLocaleLowerCase()
      )
    )
    .sort((a, b) => {
      // If within SUGGESTION_DISPLAY_LIMIT there's one from SUGGESTION_PRIORITY,
      // we move it to the top.
      const aPriority = SUGGESTION_PRIORITY[a.id] ?? Number.MAX_SAFE_INTEGER;
      const bPriority = SUGGESTION_PRIORITY[b.id] ?? Number.MAX_SAFE_INTEGER;
      return aPriority - bPriority;
    });
}

/**
 * Filters agent suggestions based on a query, with fallback support.
 *
 * When the query is empty, returns suggestions in their pre-defined order.
 * When the query is non-empty, filters and sorts both primary and fallback
 * suggestions, prioritizing results from the user's list.
 *
 * @param query - The search query string
 * @param suggestions - Primary suggestions (e.g., user's favorite agents)
 * @param fallbackSuggestions - Fallback suggestions (e.g., all available agents)
 * @returns Filtered and sorted suggestions, up to SUGGESTION_DISPLAY_LIMIT
 */
export function filterAgentSuggestions(
  query: string,
  suggestions: RichAgentMention[],
  fallbackSuggestions: RichAgentMention[]
): RichAgentMention[] {
  // When queried without content, keep the pre-defined order.
  if (query === "") {
    return suggestions.slice(0, SUGGESTION_DISPLAY_LIMIT);
  }

  const lowerCaseQuery = query.toLowerCase();

  const inListSuggestions = filterAndSortAgentSuggestions(
    lowerCaseQuery,
    suggestions
  ).slice(0, SUGGESTION_DISPLAY_LIMIT);

  // If there are enough suggestions from the user's list, use them.
  if (inListSuggestions.length >= SUGGESTION_DISPLAY_LIMIT) {
    return inListSuggestions;
  }

  // Otherwise, fallback to all suggestions.
  const allSuggestionsNoDuplicates = filterAndSortAgentSuggestions(
    lowerCaseQuery,
    fallbackSuggestions
  ).filter((item) => !inListSuggestions.find((i) => i.id === item.id));

  // Sorts user's list suggestions alphabetically first, then appends and
  // sorts remaining suggestions alphabetically, without sorting the combined
  // list again.
  return [...inListSuggestions, ...allSuggestionsNoDuplicates].slice(
    0,
    SUGGESTION_DISPLAY_LIMIT
  );
}

/**
 * Filters all mention suggestions (agents and users) based on a query.
 *
 * Currently only supports agent suggestions, but structured to support
 * user mentions in the future.
 */
export function filterMentionSuggestions(
  query: string,
  suggestions: RichMention[],
  fallbackSuggestions: RichMention[]
): RichMention[] {
  // Separate agent and user suggestions.
  const agentSuggestions = suggestions.filter(isRichAgentMention);
  const fallbackAgentSuggestions =
    fallbackSuggestions.filter(isRichAgentMention);

  // For now, only filter agents.
  return filterAgentSuggestions(
    query,
    agentSuggestions,
    fallbackAgentSuggestions
  );
}

/**
 * Utilities for mention suggestion filtering and sorting.
 */
export const mentionSuggestions = {
  filter: filterMentionSuggestions,
  filterAgents: filterAgentSuggestions,
  displayLimit: SUGGESTION_DISPLAY_LIMIT,
  priorities: SUGGESTION_PRIORITY,
};
