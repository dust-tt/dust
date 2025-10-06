import { compareForFuzzySort, subFilter } from "@app/lib/utils";
import { GLOBAL_AGENTS_SID } from "@app/types";

export interface EditorSuggestion {
  id: string;
  label: string;
  pictureUrl: string;
  userFavorite: boolean;
  description: string;
}

export interface EditorSuggestions {
  suggestions: EditorSuggestion[];
  fallbackSuggestions: EditorSuggestion[];
  isLoading: boolean;
}

const SUGGESTION_DISPLAY_LIMIT = 7;

const SUGGESTION_PRIORITY: Record<string, number> = {
  [GLOBAL_AGENTS_SID.DUST]: 1,
  [GLOBAL_AGENTS_SID.DUST_DEEP]: 2,
};

function filterAndSortSuggestions(
  lowerCaseQuery: string,
  suggestions: EditorSuggestion[]
) {
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
      // If within SUGGESTION_DISPLAY_LIMIT there's one from SUGGESTION_PRIORITY, we move it to the top.
      const aPriority = SUGGESTION_PRIORITY[a.id] ?? Number.MAX_SAFE_INTEGER;
      const bPriority = SUGGESTION_PRIORITY[b.id] ?? Number.MAX_SAFE_INTEGER;
      return aPriority - bPriority;
    });
}

export function filterSuggestions(
  query: string,
  suggestions: EditorSuggestion[],
  fallbackSuggestions: EditorSuggestion[]
): EditorSuggestion[] {
  // keeping the pre-defined order when queried without content
  if (query === "") {
    return suggestions.slice(0, SUGGESTION_DISPLAY_LIMIT);
  }

  const lowerCaseQuery = query.toLowerCase();

  const inListSuggestions = filterAndSortSuggestions(
    lowerCaseQuery,
    suggestions
  ).slice(0, SUGGESTION_DISPLAY_LIMIT);

  // If there is enough suggestions from the user's list use them.
  if (inListSuggestions.length >= SUGGESTION_DISPLAY_LIMIT) {
    return inListSuggestions;
  }

  // Otherwise, fallback to all the suggestions.
  const allSuggestionsNoDuplicates = filterAndSortSuggestions(
    lowerCaseQuery,
    fallbackSuggestions
  ).filter((item) => !inListSuggestions.find((i) => i.id === item.id));

  // Sorts user's list suggestions alphabetically first,
  // then appends and sorts remaining suggestions alphabetically,
  // without sorting the combined list again.
  const combinedSuggestions = [
    ...inListSuggestions,
    ...allSuggestionsNoDuplicates,
  ].slice(0, SUGGESTION_DISPLAY_LIMIT);

  return combinedSuggestions;
}
