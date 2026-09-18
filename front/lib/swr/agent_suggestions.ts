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

/**
 * Accept/reject a suggestion without depending on any specific SWR cache shape or on a
 * `SidekickSuggestionsContext`-style provider. Meant for surfaces (like a plain conversation
 * message) that just need working buttons on a suggestion card, not the sidekick's richer
 * bookkeeping (editor sync, pending/outdated list splitting, refetch debouncing).
 *
 * Tracks an optimistic state override per suggestion id locally, reverting it if the request
 * fails, so callers can compute the card's displayed state as `overrides[sId] ?? suggestion.state`
 * without needing to touch their own suggestions list.
 */
export function useAgentSuggestionActions({
  agentConfigurationId,
  workspaceId,
}: {
  agentConfigurationId: string | null;
  workspaceId: string;
}) {
  const { patchSuggestions } = usePatchAgentSuggestions({
    agentConfigurationId,
    workspaceId,
  });
  const [overrides, setOverrides] = useState<
    Record<string, AgentSuggestionState>
  >({});

  const resolveSuggestionState = useCallback(
    (suggestion: { sId: string; state: AgentSuggestionState }) =>
      overrides[suggestion.sId] ?? suggestion.state,
    [overrides]
  );

  const setSuggestionState = useCallback(
    async (
      suggestion: { sId: string },
      nextState: Extract<AgentSuggestionState, "approved" | "rejected">
    ): Promise<boolean> => {
      setOverrides((current) => ({ ...current, [suggestion.sId]: nextState }));

      const result = await patchSuggestions([suggestion.sId], nextState);
      if (!result || result.suggestions.length === 0) {
        setOverrides((current) => {
          const { [suggestion.sId]: _removed, ...rest } = current;
          return rest;
        });
        return false;
      }

      return true;
    },
    [patchSuggestions]
  );

  const acceptSuggestion = useCallback(
    (suggestion: { sId: string }) => setSuggestionState(suggestion, "approved"),
    [setSuggestionState]
  );
  const rejectSuggestion = useCallback(
    (suggestion: { sId: string }) => setSuggestionState(suggestion, "rejected"),
    [setSuggestionState]
  );

  return { resolveSuggestionState, acceptSuggestion, rejectSuggestion };
}
