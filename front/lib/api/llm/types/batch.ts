import type { LLMEvent } from "@app/lib/api/llm/types/events";

/**
 * Status of the batch processing sent to the LLM:
 * - "computing": the batch is still being processed.
 * - "ready": the batch completed and results are available.
 * - "aborted": the batch will never produce results (failed, expired, cancelled, etc.).
 */
export type BatchStatus = "computing" | "ready" | "aborted";

/**
 * Outcome of a batch deletion:
 * - "deleted": the batch data was deleted from the provider.
 * - "do_not_exist": the batch no longer exists on the provider.
 * - "unsupported": the provider does not support batch deletion.
 */
export type BatchDeletionOutcome = "deleted" | "do_not_exist" | "unsupported";

/**
 * Check whether a provider SDK error is an HTTP 404 (batch or file not found).
 * Provider SDKs expose the HTTP status as `status` (Anthropic, OpenAI, Google)
 * or `statusCode` (Mistral).
 */
export function isBatchNotFoundError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (("status" in err && err.status === 404) ||
      ("statusCode" in err && err.statusCode === 404))
  );
}

/**
 * Maps each conversation's custom_id to the sequence of LLM events produced for it.
 */
export type BatchResult = Map<string, LLMEvent[]>;

/**
 * Enriched batch result that includes the dustRunId for each entry,
 * enabling linkage between batch results and run_usages for cost tracking.
 */
export type BatchResultWithRunIds = Map<
  string,
  { events: LLMEvent[]; dustRunId: string }
>;
