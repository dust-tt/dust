import type { LLMEvent } from "@app/lib/api/llm/types/events";

export type BatchStatus = "computing" | "ready";

/**
 * Maps each conversation's custom_id to the sequence of LLM events produced for it.
 */
export type BatchResult = Map<string, LLMEvent[]>;
