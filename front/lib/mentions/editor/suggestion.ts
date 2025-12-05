import type { RichAgentMention } from "@app/types";
import { compareAgentsForSort, GLOBAL_AGENTS_SID } from "@app/types";

import { compareForFuzzySort, subFilter } from "../../utils";

/**
 * Maximum number of suggestions to display in the autocomplete dropdown.
 */
export const SUGGESTION_DISPLAY_LIMIT = 7;

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

export function filterAndSortEditorSuggestionAgents(
  lowerCaseQuery: string,
  suggestions: RichAgentMention[]
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
