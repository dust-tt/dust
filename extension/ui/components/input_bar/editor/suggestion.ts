import { filterAndSortAgents } from "@app/shared/lib/utils";

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

// No local priority or special-casing; reuse shared filterAndSortAgents.

function filterAndSortSuggestions(query: string, suggestions: EditorSuggestion[]) {
  return filterAndSortAgents(suggestions, query) as EditorSuggestion[];
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

  const inListSuggestions = filterAndSortSuggestions(query, suggestions).slice(
    0,
    SUGGESTION_DISPLAY_LIMIT
  );

  // If there is enough suggestions from the user's list use them.
  if (inListSuggestions.length >= SUGGESTION_DISPLAY_LIMIT) {
    return inListSuggestions;
  }

  // Otherwise, fallback to all the suggestions.
  const allSuggestionsNoDuplicates = filterAndSortSuggestions(
    query,
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
