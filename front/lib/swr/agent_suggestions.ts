import { useSendNotification } from "@app/hooks/useNotification";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  GetSuggestionsQuery,
  GetSuggestionsResponseBody,
  PatchSuggestionRequestBody,
  PatchSuggestionResponseBody,
} from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/suggestions";
import { isAPIErrorResponse } from "@app/types/error";
import { useCallback } from "react";
import type { Fetcher } from "swr";

export function useAgentSuggestions({
  agentConfigurationId,
  disabled,
  kind,
  state,
  limit,
  workspaceId,
}: {
  agentConfigurationId: string | null;
  disabled?: boolean;
  kind?: GetSuggestionsQuery["kind"];
  state?: GetSuggestionsQuery["states"];
  limit?: number;
  workspaceId: string;
}) {
  const { fetcher } = useFetcher();
  const suggestionsFetcher: Fetcher<GetSuggestionsResponseBody> = fetcher;

  const urlParams = new URLSearchParams();
  if (state) {
    state.forEach((s) => urlParams.append("states", s));
  }
  if (kind) {
    urlParams.append("kind", kind);
  }
  if (limit !== undefined) {
    urlParams.append("limit", limit.toString());
  }

  const queryString = urlParams.toString();

  const { data, error, mutate, isValidating, isLoading } = useSWRWithDefaults(
    agentConfigurationId
      ? `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/suggestions?${queryString}`
      : null,
    suggestionsFetcher,
    { disabled }
  );

  return {
    suggestions: data?.suggestions ?? emptyArray(),
    isSuggestionsLoading: isLoading,
    isSuggestionsError: !!error,
    isSuggestionsValidating: isValidating,
    mutateSuggestions: mutate,
  };
}

export function usePatchAgentSuggestions({
  agentConfigurationId,
  workspaceId,
}: {
  agentConfigurationId: string | null;
  workspaceId: string;
}) {
  const sendNotification = useSendNotification();
  const { mutateSuggestions } = useAgentSuggestions({
    agentConfigurationId,
    workspaceId,
    state: ["pending"],
    disabled: true,
  });

  const { fetcherWithBody } = useFetcher();

  const patchSuggestions = useCallback(
    async (
      suggestionIds: string[],
      state: PatchSuggestionRequestBody["state"]
    ): Promise<PatchSuggestionResponseBody | null> => {
      if (!agentConfigurationId || suggestionIds.length === 0) {
        return null;
      }

      try {
        const data: PatchSuggestionResponseBody = await fetcherWithBody([
          `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/suggestions`,
          {
            suggestionIds,
            state,
          } satisfies PatchSuggestionRequestBody,
          "PATCH",
        ]);

        void mutateSuggestions();
        return data;
      } catch (e) {
        if (isAPIErrorResponse(e)) {
          sendNotification({
            type: "error",
            title: "Failed to update suggestion",
            description: e.error.message,
          });
        } else {
          sendNotification({
            type: "error",
            title: "Failed to update suggestion",
          });
        }
        return null;
      }
    },
    [
      agentConfigurationId,
      mutateSuggestions,
      sendNotification,
      workspaceId,
      fetcherWithBody,
    ]
  );

  return { patchSuggestions };
}
