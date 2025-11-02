import { GLOBAL_AGENTS_SID } from "@app/shared/lib/global_agents";
import {
  AgentConfigurationForSort,
  filterAndSortAgents,
} from "@app/shared/lib/utils";

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

function filterAndSortSuggestions(
  lowerCaseQuery: string,
  suggestions: EditorSuggestion[]
) {
  return toEditorSuggestions(
    filterAndSortAgents(
      toAgentConfigurationForSorts(suggestions),
      lowerCaseQuery
    )
  ).sort((a, b) => {
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

function toAgentConfigurationForSorts(
  suggestions: EditorSuggestion[]
): AgentConfigurationForSort[] {
  return suggestions.map((suggestion) => ({
    name: suggestion.label,
    sId: suggestion.id,
    userFavorite: suggestion.userFavorite,
    scope: "hidden",
    pictureUrl: suggestion.pictureUrl,
    description: suggestion.description,
  }));
}

function toEditorSuggestions(
  agentConfigurationForSort: AgentConfigurationForSort[]
): EditorSuggestion[] {
  return agentConfigurationForSort.map((a) => ({
    id: a.sId,
    label: a.name,
    pictureUrl: a.pictureUrl,
    userFavorite: a.userFavorite,
    description: a.description,
  }));
}
