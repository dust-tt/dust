import type { BatchEndpointConstructor } from "@app/lib/model_constructors/batch/configuration";
import { AnthropicGlobalClaudeSonnetFourDotSixBatch } from "@app/lib/model_constructors/batch/endpoints/anthropic_global_claude_sonnet_four_dot_six";

export const BATCH_ENDPOINTS = {
  [AnthropicGlobalClaudeSonnetFourDotSixBatch.id]:
    AnthropicGlobalClaudeSonnetFourDotSixBatch,
} as const satisfies Record<string, BatchEndpointConstructor>;

export type BatchEndpointId = keyof typeof BATCH_ENDPOINTS;
