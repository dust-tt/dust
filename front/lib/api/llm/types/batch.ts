import type { LLMEvent } from "@app/lib/api/llm/types/events";

/**
 * Status of the batch processing sent to the LLM:
 * - "computing": the batch is still being processed.
 * - "ready": the batch completed and results are available.
 * - "aborted": the batch will never produce results (failed, expired, cancelled, etc.).
 */
export type BatchStatus = "computing" | "ready" | "aborted";

/**
 * Maps each conversation's custom_id to the sequence of LLM events produced for it.
 */
export type BatchResult = Map<string, LLMEvent[]>;
