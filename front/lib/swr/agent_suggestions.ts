import type { Fetcher } from "swr";

import {
  emptyArray,
  fetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { GetSuggestionsQuery, GetSuggestionsResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/suggestions";

export function useAgentSuggestions({
  agentConfigurationId,
  disabled,
  state,
  workspaceId,
}: {
  agentConfigurationId: string | null;
  disabled?: boolean;
  state?: GetSuggestionsQuery["states"];
  workspaceId: string;
}) {
  const suggestionsFetcher: Fetcher<GetSuggestionsResponseBody> = fetcher;

  const urlParams = new URLSearchParams();
  if (state) {
    state.forEach((s) => urlParams.append("states[]", s));
  }
  urlParams.append("kind", "instructions");

  const queryString = urlParams.toString();

  const { data, error, mutate, isValidating } = useSWRWithDefaults(
    agentConfigurationId
      ? `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/suggestions?${queryString}`
      : null,
    suggestionsFetcher,
    { disabled }
  );

  return {
    suggestions: data?.suggestions ?? emptyArray(),
    isSuggestionsLoading:
      !!agentConfigurationId && !error && !data && !disabled,
    isSuggestionsError: error,
    isSuggestionsValidating: isValidating,
    mutateSuggestions: mutate,
  };
}
