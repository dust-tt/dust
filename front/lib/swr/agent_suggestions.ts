import { useSendNotification } from "@app/hooks/useNotification";
import { getBrowserMarkdownPipeline } from "@app/lib/editor/browser_markdown_pipeline";
import { previewAgentSuggestions } from "@app/lib/editor/preview_agent_suggestions";
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
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";
import { useCallback, useMemo, useState } from "react";
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

interface UseAgentSuggestionsPreviewParams {
  agent: AgentConfigurationType | null;
  suggestions: AgentSuggestionType[];
}

export function useAgentSuggestionsPreview({
  agent,
  suggestions,
}: UseAgentSuggestionsPreviewParams) {
  const preview = useMemo(() => {
    if (!agent || suggestions.length === 0) {
      return null;
    }

    const previewRes = previewAgentSuggestions({
      agent,
      suggestions,
      pipeline: getBrowserMarkdownPipeline(),
    });

    return previewRes.isOk() ? previewRes.value : null;
  }, [agent, suggestions]);

  return { preview };
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

type SuggestionReviewAction = "accept" | "reject";

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
  const [pendingActions, setPendingActions] = useState<
    Record<string, SuggestionReviewAction>
  >({});

  const getPendingAction = useCallback(
    (suggestion: { sId: string }): SuggestionReviewAction | null =>
      pendingActions[suggestion.sId] ?? null,
    [pendingActions]
  );

  const setSuggestionState = useCallback(
    async (
      suggestion: { sId: string },
      action: SuggestionReviewAction,
      options?: { applyToAgent?: boolean }
    ): Promise<boolean> => {
      setPendingActions((current) => ({
        ...current,
        [suggestion.sId]: action,
      }));

      const result = await patchSuggestions(
        [suggestion.sId],
        action === "accept" ? "approved" : "rejected",
        options
      );

      setPendingActions((current) => {
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
      setSuggestionState(suggestion, "accept", { applyToAgent: true }),
    [setSuggestionState]
  );
  const rejectSuggestion = useCallback(
    (suggestion: { sId: string }) => setSuggestionState(suggestion, "reject"),
    [setSuggestionState]
  );

  return {
    getPendingAction,
    acceptSuggestion,
    rejectSuggestion,
  };
}
