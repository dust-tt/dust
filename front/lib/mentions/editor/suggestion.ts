import type { EditorSuggestionAgent } from "@app/components/assistant/conversation/input_bar/editor/suggestion";
import type { RichMention, RichUserMention } from "@app/types";
import type { RichAgentMention } from "@app/types";
import { compareAgentsForSort, GLOBAL_AGENTS_SID } from "@app/types";
import { isRichAgentMention, isRichUserMention } from "@app/types";

import { compareForFuzzySort, subFilter } from "../../utils";

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

export function compareAgentSuggestionsForSort(
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

function filterAndSortEditorSuggestionAgents(
  lowerCaseQuery: string,
  suggestions: EditorSuggestionAgent[]
) {
  return suggestions
    .filter((item) => subFilter(lowerCaseQuery, item.label.toLowerCase()))
    .sort(
      (a, b) =>
        compareForFuzzySort(
          lowerCaseQuery,
          a.label.toLocaleLowerCase(),
          b.label.toLocaleLowerCase()
        ) || compareAgentSuggestionsForSort(a, b)
    )
    .sort((a, b) => {
      // If within SUGGESTION_DISPLAY_LIMIT there's one from SUGGESTION_PRIORITY, we move it to the top.
      const aPriority = SUGGESTION_PRIORITY[a.id] ?? Number.MAX_SAFE_INTEGER;
      const bPriority = SUGGESTION_PRIORITY[b.id] ?? Number.MAX_SAFE_INTEGER;
      return aPriority - bPriority;
    });
}

export function filterAgentSuggestions(
  query: string,
  suggestions: EditorSuggestionAgent[],
  fallbackSuggestions: EditorSuggestionAgent[]
): EditorSuggestionAgent[] {
  // keeping the pre-defined order when queried without content
  if (query === "") {
    return suggestions.slice(0, SUGGESTION_DISPLAY_LIMIT);
  }

  const lowerCaseQuery = query.toLowerCase();

  const inListSuggestions = filterAndSortEditorSuggestionAgents(
    lowerCaseQuery,
    suggestions
  ).slice(0, SUGGESTION_DISPLAY_LIMIT);

  // If there are enough suggestions from the user's list, use them.
  if (inListSuggestions.length >= SUGGESTION_DISPLAY_LIMIT) {
    return inListSuggestions;
  }

  // Otherwise, fallback to all the suggestions.
  const allSuggestionsNoDuplicates = filterAndSortEditorSuggestionAgents(
    lowerCaseQuery,
    fallbackSuggestions
  ).filter((item) => !inListSuggestions.find((i) => i.id === item.id));

  // Sorts user's list suggestions alphabetically first,
  // then appends and sorts remaining suggestions alphabetically,
  // without sorting the combined list again.
  return [...inListSuggestions, ...allSuggestionsNoDuplicates].slice(
    0,
    SUGGESTION_DISPLAY_LIMIT
  );
}

/**
 * Filters and sorts user mention suggestions based on a query string.
 */
function filterAndSortUserSuggestions(
  lowerCaseQuery: string,
  suggestions: RichUserMention[]
): RichUserMention[] {
  return suggestions
    .filter((item) => subFilter(lowerCaseQuery, item.label.toLowerCase()))
    .sort((a, b) =>
      compareForFuzzySort(
        lowerCaseQuery,
        a.label.toLocaleLowerCase(),
        b.label.toLocaleLowerCase()
      )
    );
}

/**
 * Filters user suggestions based on a query, with fallback support.
 *
 * When the query is empty, returns suggestions in their pre-defined order.
 * When the query is non-empty, filters and sorts both primary and fallback
 * suggestions, prioritizing results from the user's list.
 *
 * @param query - The search query string
 * @param suggestions - Primary suggestions (e.g., recent/favorite users)
 * @param fallbackSuggestions - Fallback suggestions (e.g., all workspace users)
 * @returns Filtered and sorted suggestions, up to SUGGESTION_DISPLAY_LIMIT
 */
export function filterUserSuggestions(
  query: string,
  suggestions: RichUserMention[],
  fallbackSuggestions: RichUserMention[]
): RichUserMention[] {
  // When queried without content, keep the pre-defined order.
  if (query === "") {
    return suggestions.slice(0, SUGGESTION_DISPLAY_LIMIT);
  }

  const lowerCaseQuery = query.toLowerCase();

  const inListSuggestions = filterAndSortUserSuggestions(
    lowerCaseQuery,
    suggestions
  ).slice(0, SUGGESTION_DISPLAY_LIMIT);

  // If there are enough suggestions from the user's list, use them.
  if (inListSuggestions.length >= SUGGESTION_DISPLAY_LIMIT) {
    return inListSuggestions;
  }

  // Otherwise, fallback to all suggestions.
  const allSuggestionsNoDuplicates = filterAndSortUserSuggestions(
    lowerCaseQuery,
    fallbackSuggestions
  ).filter((item) => !inListSuggestions.find((i) => i.id === item.id));

  return [...inListSuggestions, ...allSuggestionsNoDuplicates].slice(
    0,
    SUGGESTION_DISPLAY_LIMIT
  );
}

/**
 * Filters all mention suggestions (agents and users) based on a query.
 *
 * Supports both agent and user suggestions. User suggestions are only
 * returned when the mentions_v2 feature flag is enabled (controlled by caller).
 */
export function filterMentionSuggestions(
  query: string,
  suggestions: RichMention[],
  fallbackSuggestions: RichMention[]
): RichMention[] {
  // Separate agent and user suggestions.
  const agentSuggestions = suggestions.filter(isRichAgentMention);
  const userSuggestions = suggestions.filter(isRichUserMention);
  const fallbackAgentSuggestions =
    fallbackSuggestions.filter(isRichAgentMention);
  const fallbackUserSuggestions = fallbackSuggestions.filter(isRichUserMention);

  // Filter both agents and users.
  const filteredAgents = filterAgentSuggestions(
    query,
    agentSuggestions,
    fallbackAgentSuggestions
  );

  const filteredUsers = filterUserSuggestions(
    query,
    userSuggestions,
    fallbackUserSuggestions
  );

  // Combine results: agents first, then users.
  // If we have too many results, we prioritize agents.
  const totalResults = [...filteredAgents, ...filteredUsers];
  return totalResults.slice(0, SUGGESTION_DISPLAY_LIMIT);
}

/**
 * Utilities for mention suggestion filtering and sorting.
 */
export const mentionSuggestions = {
  filter: filterMentionSuggestions,
  filterAgents: filterAgentSuggestions,
  filterUsers: filterUserSuggestions,
  displayLimit: SUGGESTION_DISPLAY_LIMIT,
  priorities: SUGGESTION_PRIORITY,
};
