import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  GetSuggestionBatchesResponseBody,
  PatchSuggestionBatchRequestBody,
  PatchSuggestionBatchResponseBody,
  SuggestionBatchReviewState,
} from "@app/types/api/assistant/suggestion_batches";
import { isString } from "@app/types/shared/utils/general";
import type { BatchSuggestionType } from "@app/types/suggestions/batch_suggestion";
import { useCallback } from "react";
import type { Fetcher } from "swr";
import { useSWRConfig } from "swr";

interface UseSuggestionBatchParams {
  batchId: string | null;
  workspaceId: string;
}

export function useSuggestionBatch({
  batchId,
  workspaceId,
}: UseSuggestionBatchParams) {
  const { fetcher } = useFetcher();
  const batchesFetcher: Fetcher<GetSuggestionBatchesResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    batchId
      ? `/api/w/${workspaceId}/assistant/suggestion_batches?ids=${encodeURIComponent(batchId)}`
      : null,
    batchesFetcher
  );

  return {
    batch: data?.batches.find((b) => b.id === batchId) ?? null,
    isBatchLoading: !!batchId && !error && !data,
    isBatchError: !!error,
    mutateBatch: mutate,
  };
}

interface UsePatchSuggestionBatchParams {
  workspaceId: string;
}

export function usePatchSuggestionBatch({
  workspaceId,
}: UsePatchSuggestionBatchParams) {
  const sendNotification = useSendNotification();

  const patchBatch = useCallback(
    async (
      batchId: string,
      state: SuggestionBatchReviewState
    ): Promise<PatchSuggestionBatchResponseBody | null> => {
      try {
        const res = await clientFetch(
          `/api/w/${workspaceId}/assistant/suggestion_batches/${batchId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              state,
            } satisfies PatchSuggestionBatchRequestBody),
          }
        );

        if (!res.ok) {
          const errorData = await getErrorFromResponse(res);
          sendNotification({
            type: "error",
            title: "Failed to update the suggestions",
            description: errorData.message,
          });
          return null;
        }

        return await res.json();
      } catch {
        sendNotification({
          type: "error",
          title: "Failed to update the suggestions",
        });
        return null;
      }
    },
    [sendNotification, workspaceId]
  );

  return { patchBatch };
}

/**
 * Revalidates the agents and skills a batch targets, as fetched by `useAgentConfiguration` and
 * `useSkill` (whatever their query parameters), so the changes applied by the batch show.
 */
export function useRevalidateBatchTargets({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const { mutate } = useSWRConfig();

  return useCallback(
    (batch: BatchSuggestionType) => {
      const targetPaths = new Set([
        ...batch.agentSuggestions.map(
          (s) =>
            `/api/w/${workspaceId}/assistant/agent_configurations/${s.agentId}`
        ),
        ...batch.skillSuggestions.map(
          (s) => `/api/w/${workspaceId}/skills/${s.skillConfigurationId}`
        ),
      ]);

      void mutate((key) => isString(key) && targetPaths.has(key.split("?")[0]));
    },
    [mutate, workspaceId]
  );
}
