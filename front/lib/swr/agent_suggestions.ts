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
} from "@app/types/api/assistant/agent_suggestion";
import type { AgentSuggestionState } from "@app/types/suggestions/agent_suggestion";
import { useCallback, useState } from "react";
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

  const patchSuggestions = useCallback(
    async (
      suggestionIds: string[],
      state: PatchSuggestionRequestBody["state"],
      { applyToAgent }: { applyToAgent?: boolean } = {}
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
              applyToAgent,
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
    [agentConfigurationId, sendNotification, workspaceId]
  );

  return { patchSuggestions };
}

export function useAgentSuggestionActions({
  agentConfigurationId,
  workspaceId,
  mutateSuggestions,
}: {
  agentConfigurationId: string | null;
  workspaceId: string;
  mutateSuggestions: ReturnType<
    typeof useAgentSuggestions
  >["mutateSuggestions"];
}) {
  const { patchSuggestions } = usePatchAgentSuggestions({
    agentConfigurationId,
    workspaceId,
  });
  const [pendingIds, setPendingIds] = useState<Record<string, boolean>>({});

  const isSuggestionPending = useCallback(
    (suggestion: { sId: string }) => pendingIds[suggestion.sId] ?? false,
    [pendingIds]
  );

  const setSuggestionState = useCallback(
    async (
      suggestion: { sId: string },
      nextState: Extract<AgentSuggestionState, "approved" | "rejected">,
      options?: { applyToAgent?: boolean }
    ): Promise<boolean> => {
      setPendingIds((current) => ({ ...current, [suggestion.sId]: true }));

      const result = await patchSuggestions(
        [suggestion.sId],
        nextState,
        options
      );

      setPendingIds((current) => {
        const { [suggestion.sId]: _removed, ...rest } = current;
        return rest;
      });

      if (!result || result.suggestions.length === 0) {
        return false;
      }

      const reviewedById = new Map(result.suggestions.map((s) => [s.sId, s]));
      void mutateSuggestions(
        (current) => ({
          suggestions: (current?.suggestions ?? []).map(
            (s) => reviewedById.get(s.sId) ?? s
          ),
        }),
        { revalidate: false }
      );

      return true;
    },
    [patchSuggestions, mutateSuggestions]
  );

  // `create`/`delete` are only ever applied server-side on accept, and only when `applyToAgent`
  // is set: the route otherwise just records the review without touching the agent.
  const acceptSuggestion = useCallback(
    (suggestion: { sId: string }) =>
      setSuggestionState(suggestion, "approved", { applyToAgent: true }),
    [setSuggestionState]
  );
  const rejectSuggestion = useCallback(
    (suggestion: { sId: string }) => setSuggestionState(suggestion, "rejected"),
    [setSuggestionState]
  );

  return {
    isSuggestionPending,
    acceptSuggestion,
    rejectSuggestion,
  };
}
