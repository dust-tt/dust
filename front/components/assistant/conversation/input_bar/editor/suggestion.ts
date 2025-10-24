import {
  compareForFuzzySort,
  filterAndSortAgents,
  subFilter,
} from "@app/lib/utils";
import { AgentConfigurationForSort, GLOBAL_AGENTS_SID } from "@app/types";

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
  return toEditorSuggestions(
    filterAndSortAgents(
      toAgentConfigurationForSorts(suggestions),
      lowerCaseQuery
    )
  ).sort((a, b) => {
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

function toAgentConfigurationForSorts(
  suggestions: EditorSuggestion[]
): AgentConfigurationForSort[] {
  return suggestions.map((suggestion) => ({
    name: suggestion.label,
    sId: suggestion.id,
    userFavorite: suggestion.userFavorite,
    // fake scope since it needs not be used for sorting suggestions
    scope: "hidden",
    pictureUrl: suggestion.pictureUrl,
    description: suggestion.description,
  }));
}

function toEditorSuggestions(
  agentConfigurationForSort: AgentConfigurationForSort[]
): EditorSuggestion[] {
  return agentConfigurationForSort.map((agentConfigurationForSort) => ({
    id: agentConfigurationForSort.sId,
    label: agentConfigurationForSort.name,
    pictureUrl: agentConfigurationForSort.pictureUrl,
    userFavorite: agentConfigurationForSort.userFavorite,
    description: agentConfigurationForSort.description,
  }));
}
