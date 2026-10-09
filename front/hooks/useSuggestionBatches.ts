import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
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
import { MAX_SUGGESTION_BATCH_IDS_PER_REQUEST } from "@app/types/api/assistant/suggestion_batches";
import { isString } from "@app/types/shared/utils/general";
import type { BatchSuggestionType } from "@app/types/suggestions/batch_suggestion";
import { useLingui } from "@lingui/react/macro";
import chunk from "lodash/chunk";
import { useCallback } from "react";
import type { Fetcher } from "swr";
import { useSWRConfig } from "swr";

interface UseSuggestionBatchesParams {
  batchIds: string[];
  workspaceId: string;
}

/** Fetches the given batches, however many: the endpoint caps the ids per request. */
export function useSuggestionBatches({
  batchIds,
  workspaceId,
}: UseSuggestionBatchesParams) {
  const { fetcher } = useFetcher();
  const chunkFetcher: Fetcher<GetSuggestionBatchesResponseBody, string> =
    fetcher;

  const path = `/api/w/${workspaceId}/assistant/suggestion_batches`;
  const toQuery = (ids: string[]) =>
    new URLSearchParams(ids.map((id) => ["ids", id]));
  const { data, error, mutate } = useSWRWithDefaults(
    batchIds.length > 0 ? `${path}?${toQuery(batchIds)}` : null,
    async () => {
      const chunks = await Promise.all(
        chunk(batchIds, MAX_SUGGESTION_BATCH_IDS_PER_REQUEST).map((ids) =>
          chunkFetcher(`${path}?${toQuery(ids)}`)
        )
      );
      return { batches: chunks.flatMap((c) => c.batches) };
    }
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

function usePatchSuggestionBatch({
  workspaceId,
}: UsePatchSuggestionBatchParams) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
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
          sendApiErrorNotification({
            title: t`Failed to update the suggestions`,
            error: errorData,
          });
          return null;
        }

        return await res.json();
      } catch {
        sendNotification({
          type: "error",
          title: t`Failed to update the suggestions`,
        });
        return null;
      }
    },
    [sendApiErrorNotification, sendNotification, t, workspaceId]
  );

  return { patchBatch };
}

/**
 * Revalidates the agents and skills a batch targets, as fetched by `useAgentConfiguration` and
 * `useSkill` (whatever their query parameters), so the changes applied by the batch show.
 */
function useRevalidateBatchTargets({ workspaceId }: { workspaceId: string }) {
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

interface UseReviewSuggestionBatchesParams {
  workspaceId: string;
}

/**
 * @cc [owner:avervaet,label:product] review-batches-sequential-resync
 * Batches MUST be reviewed one at a time, in order: concurrent approvals of one target overwrite
 * each other. A failed review MUST leave its batch pending and resync with the server.
 */
export function useReviewSuggestionBatches({
  workspaceId,
}: UseReviewSuggestionBatchesParams) {
  const { mutate } = useSWRConfig();
  const { patchBatch } = usePatchSuggestionBatch({ workspaceId });
  const revalidateBatchTargets = useRevalidateBatchTargets({ workspaceId });

  return useCallback(
    async (batchIds: string[], state: SuggestionBatchReviewState) => {
      const reviewedById = new Map<string, BatchSuggestionType>();
      for (const batchId of batchIds) {
        const result = await patchBatch(batchId, state);
        if (result) {
          reviewedById.set(result.batch.id, result.batch);
        }
      }
      if (state === "approved") {
        reviewedById.forEach(revalidateBatchTargets);
      }
      // A batch can be cached under several queries (its own card, a pile of batches, a side
      // panel previewing it): update every one of them, not only the caller's.
      const batchesPath = `/api/w/${workspaceId}/assistant/suggestion_batches?`;
      await mutate<GetSuggestionBatchesResponseBody>(
        (key) => isString(key) && key.startsWith(batchesPath),
        (current) =>
          current && {
            batches: current.batches.map((b) => reviewedById.get(b.id) ?? b),
          },
        { revalidate: reviewedById.size < batchIds.length }
      );
    },
    [mutate, patchBatch, revalidateBatchTargets, workspaceId]
  );
}
