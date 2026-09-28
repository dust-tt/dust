// Contract types and schemas for the suggestion batches endpoints
// (`/api/w/:wId/assistant/suggestion_batches` and `.../suggestion_batches/:bId`).
import { isString } from "@app/types/shared/utils/general";
import type { BatchSuggestionType } from "@app/types/suggestions/batch_suggestion";
import { z } from "zod";

export const MAX_SUGGESTION_BATCH_IDS_PER_REQUEST = 50;

export const GetSuggestionBatchesQuerySchema = z.object({
  // A single `ids` query value is parsed as a string, repeated ones as an array.
  ids: z.preprocess(
    (v) => (isString(v) ? [v] : v),
    z.array(z.string()).min(1).max(MAX_SUGGESTION_BATCH_IDS_PER_REQUEST)
  ),
});

export type GetSuggestionBatchesResponseBody = {
  batches: BatchSuggestionType[];
};

export const PatchSuggestionBatchRequestBodySchema = z.object({
  state: z.enum(["approved", "rejected"]),
});

export type PatchSuggestionBatchRequestBody = z.infer<
  typeof PatchSuggestionBatchRequestBodySchema
>;

/** The states a reviewer can move a pending batch to. */
export type SuggestionBatchReviewState =
  PatchSuggestionBatchRequestBody["state"];

export type PatchSuggestionBatchResponseBody = {
  batch: BatchSuggestionType;
};
