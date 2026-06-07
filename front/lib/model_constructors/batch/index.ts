import type { BatchEndpointConstructor } from "@app/lib/model_constructors/batch/configuration";
import { AnthropicGlobalClaudeSonnetFourDotSixBatch } from "@app/lib/model_constructors/batch/endpoints/anthropic_anthropic_claude_sonnet_four_dot_six_global";
import type { Filter } from "@app/lib/model_constructors/types/filter";
import { getFilteredEndpoints } from "@app/lib/model_constructors/utils/filter_endpoints";

// Batch models live in a separate registry from streaming `STREAM_MODELS`: the
// two never overlap, so a model can share its id across both (same identity,
// different inference surface).
export const BATCH_MODELS = {
  [AnthropicGlobalClaudeSonnetFourDotSixBatch.id]:
    AnthropicGlobalClaudeSonnetFourDotSixBatch,
} as const satisfies Record<string, BatchEndpointConstructor>;

export type BatchModelId = keyof typeof BATCH_MODELS;

export function getAvailableBatchEndpoints(
  filter: Filter
): BatchEndpointConstructor[] {
  if (!filter.featureFlags.includes("use_new_llm_router")) {
    return [];
  }

  return getFilteredEndpoints(Object.values(BATCH_MODELS), filter);
}
