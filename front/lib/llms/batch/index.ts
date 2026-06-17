import type { DustBatchEndpointConstructor } from "@app/lib/llms/batch/dust_batch_endpoint";
import { DustAnthropicGlobalClaudeSonnetFourDotSixBatch } from "@app/lib/llms/batch/endpoints/anthropic_global_claude_sonnet_four_dot_six";
import { isEndpointAvailable } from "@app/lib/llms/batch/utils/is_endpoint_available";
import type { Where, WorkspaceFilter } from "@app/lib/llms/types/filter";
import type { BatchEndpointId } from "@app/lib/model_constructors/batch";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

export const DUST_BATCH_ENDPOINTS = {
  [DustAnthropicGlobalClaudeSonnetFourDotSixBatch.id]:
    DustAnthropicGlobalClaudeSonnetFourDotSixBatch,
} as const satisfies Record<BatchEndpointId, DustBatchEndpointConstructor>;

export function getBatchEndpoints(
  workspaceConfiguration: {
    featureFlags: WhitelistableFeature[];
    enterprise: boolean;
  },
  inputCondition: Where<WorkspaceFilter>
) {
  return Object.values(DUST_BATCH_ENDPOINTS).filter((constructor) =>
    isEndpointAvailable(constructor, workspaceConfiguration, inputCondition)
  );
}
