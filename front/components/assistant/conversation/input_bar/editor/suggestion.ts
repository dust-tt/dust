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

// Local helpers mirroring fuzzy scoring steps from compareForFuzzySort to detect
// true ties (same spread, same last index, same length) without relying on
// lexicographic fallback.
function _subFilterLastIndex(a: string, b: string) {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
    }
    j++;
  }
  return i === a.length ? j : -1;
}

function _subFilterFirstIndex(a: string, b: string) {
  let i = a.length - 1;
  let j = b.length - 1;
  while (i >= 0 && j >= 0) {
    if (a[i] === b[j]) {
      i--;
    }
    j--;
  }
  return i === -1 ? j + 1 : -1;
}

function _spreadLength(a: string, b: string) {
  const lastIndex = _subFilterLastIndex(a, b);
  if (lastIndex === -1) {
    return -1;
  }
  const firstIndex = _subFilterFirstIndex(a, b.substring(0, lastIndex));
  return lastIndex - firstIndex;
}

function preferGpt5WhenSameScore(
  lowerCaseQuery: string,
  items: EditorSuggestion[]
): EditorSuggestion[] {
  const cloned = items.slice();
  const idx4 = cloned.findIndex((i) => i.id === GLOBAL_AGENTS_SID.GPT4);
  const idx5 = cloned.findIndex((i) => i.id === GLOBAL_AGENTS_SID.GPT5);

  if (idx4 === -1 || idx5 === -1) {
    return cloned;
  }

  const l4 = cloned[idx4].label.toLowerCase();
  const l5 = cloned[idx5].label.toLowerCase();

  const spread4 = _spreadLength(lowerCaseQuery, l4);
  const spread5 = _spreadLength(lowerCaseQuery, l5);
  if (spread4 === -1 || spread5 === -1) {
    return cloned;
  }

  const last4 = _subFilterLastIndex(lowerCaseQuery, l4);
  const last5 = _subFilterLastIndex(lowerCaseQuery, l5);

  const sameScore =
    spread4 === spread5 && last4 === last5 && l4.length === l5.length;

  if (sameScore && idx4 < idx5) {
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

  // Keep fuzzy ranking intact; only tie-break when GPT-4 and GPT-5 have the exact same
  // fuzzy score for this query (same spread, same last index, same length).
  return preferGpt5WhenSameScore(lowerCaseQuery, prioritized);
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
