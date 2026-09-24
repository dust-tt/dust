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
import { useCallback, useMemo } from "react";
import type { Fetcher } from "swr";

export function useAgentSuggestions({
  agentConfigurationId,
  disabled,
  kind,
  state,
  sources,
  conversationId,
  limit,
  workspaceId,
}: {
  agentConfigurationId: string | null;
  disabled?: boolean;
  kind?: GetSuggestionsQuery["kind"];
  state?: GetSuggestionsQuery["states"];
  sources?: GetSuggestionsQuery["sources"];
  conversationId?: string;
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
  if (sources) {
    sources.forEach((s) => urlParams.append("sources", s));
  }
  if (conversationId) {
    urlParams.append("conversationId", conversationId);
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
      { apply }: { apply?: boolean } = {}
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
              applyToAgent: apply,
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
