import { compareForFuzzySort, subFilter } from "@app/lib/utils";
import { GLOBAL_AGENTS_SID } from "@app/types";

export type EditorSuggestion = EditorSuggestionUser | EditorSuggestionAgent;

interface BaseEditorSuggestion {
  id: string;
  label: string;
  pictureUrl: string;
  description: string;
}

export interface EditorSuggestionUser extends BaseEditorSuggestion {
  type: "user";
}

export interface EditorSuggestionAgent extends BaseEditorSuggestion {
  type: "agent";
  userFavorite: boolean;
}

export const isEditorSuggestionAgent = (
  suggestion: EditorSuggestion
): suggestion is EditorSuggestionAgent => suggestion.type === "agent";

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

function filterAndSortEditorSuggestionAgents(
  lowerCaseQuery: string,
  suggestions: EditorSuggestionAgent[]
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

export function filterSuggestionAgents(
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

function filterAndSortEditorSuggestions(
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
    );
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

  // Separate agents and users from suggestions
  const agents = suggestions.filter(isEditorSuggestionAgent);
  const users = suggestions.filter((s) => !isEditorSuggestionAgent(s));

  // Filter agents with priority
  const filteredAgents = filterAndSortEditorSuggestionAgents(
    lowerCaseQuery,
    agents
  );

  // Filter users alphabetically
  const filteredUsers = filterAndSortEditorSuggestions(lowerCaseQuery, users);

  // Combine: agents first (with priority), then users
  const combined = [...filteredAgents, ...filteredUsers].slice(
    0,
    SUGGESTION_DISPLAY_LIMIT
  );

  if (combined.length >= SUGGESTION_DISPLAY_LIMIT) {
    return combined;
  }

  // If not enough results, also search in fallback suggestions
  const fallbackAgents = fallbackSuggestions.filter(isEditorSuggestionAgent);
  const fallbackUsers = fallbackSuggestions.filter(
    (s) => !isEditorSuggestionAgent(s)
  );

  const filteredFallbackAgents = filterAndSortEditorSuggestionAgents(
    lowerCaseQuery,
    fallbackAgents
  ).filter((item) => !combined.find((i) => i.id === item.id));

  const filteredFallbackUsers = filterAndSortEditorSuggestions(
    lowerCaseQuery,
    fallbackUsers
  ).filter((item) => !combined.find((i) => i.id === item.id));

  return [
    ...combined,
    ...filteredFallbackAgents,
    ...filteredFallbackUsers,
  ].slice(0, SUGGESTION_DISPLAY_LIMIT);
}
