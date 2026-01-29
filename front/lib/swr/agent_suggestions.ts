import type { Fetcher } from "swr";

import { clientFetch } from "@app/lib/egress/client";
import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  GetSuggestionsQuery,
  GetSuggestionsResponseBody,
  PatchSuggestionRequestBody,
  PatchSuggestionResponseBody,
} from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/suggestions";

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
    state.forEach((s) => urlParams.append("states", s));
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

export function usePatchAgentSuggestion({
  agentConfigurationId,
  workspaceId,
}: {
  agentConfigurationId: string | null;
  workspaceId: string;
}) {
  const { mutateSuggestions } = useAgentSuggestions({
    agentConfigurationId,
    workspaceId,
    state: ["pending"],
    disabled: true,
  });

  const patchSuggestion = async (
    suggestionId: string,
    state: PatchSuggestionRequestBody["state"]
  ): Promise<PatchSuggestionResponseBody | null> => {
    if (!agentConfigurationId) {
      return null;
    }

    const res = await clientFetch(
      `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/suggestions`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          suggestionId,
          state,
        } satisfies PatchSuggestionRequestBody),
      }
    );

    if (res.ok) {
      void mutateSuggestions();
      return res.json();
    }

    return null;
  };

  return { patchSuggestion };
}
