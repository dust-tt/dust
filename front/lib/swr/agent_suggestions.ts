import type { Fetcher } from "swr";

import {
  emptyArray,
  fetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { GetSuggestionsResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/suggestions";

export function useAgentSuggestions({
  workspaceId,
  agentConfigurationId,
  disabled,
}: {
  workspaceId: string;
  agentConfigurationId: string | null;
  disabled?: boolean;
}) {
  const suggestionsFetcher: Fetcher<GetSuggestionsResponseBody> = fetcher;

  const { data, error, mutate, isValidating } = useSWRWithDefaults(
    agentConfigurationId
      ? `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/suggestions?states[]=pending&kind=instructions`
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
