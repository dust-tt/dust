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
  [GLOBAL_AGENTS_SID.DEEP_DIVE]: 2,
};

function gentlyPreferGpt5WhenNearGpt4(
  items: EditorSuggestion[]
): EditorSuggestion[] {
  const cloned = items.slice();
  const idx4 = cloned.findIndex((i) => i.id === GLOBAL_AGENTS_SID.GPT4);
  const idx5 = cloned.findIndex((i) => i.id === GLOBAL_AGENTS_SID.GPT5);

  if (idx4 === -1 || idx5 === -1) {
    return cloned;
  }

  // Only adjust when results are very close (adjacent) and GPT-4 is listed above GPT-5.
  if (idx4 < idx5 && Math.abs(idx5 - idx4) === 1) {
    const [gpt5Item] = cloned.splice(idx5, 1);
    cloned.splice(idx4, 0, gpt5Item);
  }

  return cloned;
}

function filterAndSortSuggestions(
  lowerCaseQuery: string,
  suggestions: EditorSuggestion[]
) {
  const filtered = suggestions
    .filter((item) => subFilter(lowerCaseQuery, item.label.toLowerCase()))
    .sort((a, b) =>
      compareForFuzzySort(
        lowerCaseQuery,
        a.label.toLocaleLowerCase(),
        b.label.toLocaleLowerCase()
      )
    );

  // Move high-priority global agents (e.g., Dust, Deep Dive) to the front while leaving
  // the fuzzy ranking of other items unchanged.
  const prioritized = filtered.sort((a, b) => {
    const aPriority = SUGGESTION_PRIORITY[a.id] ?? Number.MAX_SAFE_INTEGER;
    const bPriority = SUGGESTION_PRIORITY[b.id] ?? Number.MAX_SAFE_INTEGER;
    return aPriority - bPriority;
  });

  // Keep fuzzy ranking intact; apply only a gentle tie-breaker when GPT-4 and GPT-5 are adjacent.
  return gentlyPreferGpt5WhenNearGpt4(prioritized);
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
