import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  emptyArray,
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

interface UseSuggestionBatchesParams {
  batchIds: string[];
  workspaceId: string;
}

/** Fetches the given batches in one request, at most `MAX_SUGGESTION_BATCH_IDS_PER_REQUEST`. */
export function useSuggestionBatches({
  batchIds,
  workspaceId,
}: UseSuggestionBatchesParams) {
  const { fetcher } = useFetcher();
  const batchesFetcher: Fetcher<GetSuggestionBatchesResponseBody> = fetcher;

  const query = new URLSearchParams(batchIds.map((id) => ["ids", id]));
  const { data, error, mutate } = useSWRWithDefaults(
    batchIds.length > 0
      ? `/api/w/${workspaceId}/assistant/suggestion_batches?${query}`
      : null,
    batchesFetcher
  );

  return {
    batches: data?.batches ?? emptyArray(),
    isBatchesLoading: batchIds.length > 0 && !error && !data,
    isBatchesError: !!error,
    mutateBatches: mutate,
  };
}

interface UseSuggestionBatchParams {
  batchId: string | null;
  workspaceId: string;
}

export function useSuggestionBatch({
  batchId,
  workspaceId,
}: UseSuggestionBatchParams) {
  const { batches, isBatchesLoading, isBatchesError, mutateBatches } =
    useSuggestionBatches({
      batchIds: batchId ? [batchId] : [],
      workspaceId,
    });

  return {
    batch: batches.find((b) => b.id === batchId) ?? null,
    isBatchLoading: isBatchesLoading,
    isBatchError: isBatchesError,
    mutateBatch: mutateBatches,
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
