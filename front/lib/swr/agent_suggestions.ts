import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  GetSuggestionsQuery,
  GetSuggestionsResponseBody,
  PatchSuggestionRequestBody,
  PatchSuggestionResponseBody,
} from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/suggestions";
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

  const patchSuggestions = useCallback(
    async (
      suggestionIds: string[],
      state: PatchSuggestionRequestBody["state"]
    ): Promise<PatchSuggestionResponseBody | null> => {
      if (!agentConfigurationId || suggestionIds.length === 0) {
        return null;
      }

      try {
        const res = await clientFetch(
          `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/suggestions`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              suggestionIds,
              state,
            } satisfies PatchSuggestionRequestBody),
          }
        );

        if (!res.ok) {
          const errorData = await getErrorFromResponse(res);
          sendNotification({
            type: "error",
            title: "Failed to update suggestion",
            description: errorData.message,
          });
          return null;
        }

        void mutateSuggestions();
        const data = await res.json();
        return data;
      } catch {
        sendNotification({
          type: "error",
          title: "Failed to update suggestion",
        });
        return null;
      }
    },
    [agentConfigurationId, mutateSuggestions, sendNotification, workspaceId]
  );

  return { patchSuggestions };
}
