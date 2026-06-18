import type { DustBatchEndpointConstructor } from "@app/lib/llms/batch/dust_batch_endpoint";
import { DustAnthropicGlobalClaudeSonnetFourDotSixBatch } from "@app/lib/llms/batch/endpoints/anthropic_global_claude_sonnet_four_dot_six";
import { isEndpointAvailable } from "@app/lib/llms/batch/utils/is_endpoint_available";
import type {
  EndpointConfig,
  Where,
  WorkspaceConfig,
} from "@app/lib/llms/types/filter";
import type { BatchEndpointId } from "@app/lib/model_constructors/batch";

export const DUST_BATCH_ENDPOINTS = {
  [DustAnthropicGlobalClaudeSonnetFourDotSixBatch.id]:
    DustAnthropicGlobalClaudeSonnetFourDotSixBatch,
} as const satisfies Record<BatchEndpointId, DustBatchEndpointConstructor>;

export function getBatchEndpoints(
  workspaceConfiguration: WorkspaceConfig,
  inputCondition: Where<EndpointConfig>
) {
  return Object.values(DUST_BATCH_ENDPOINTS).filter((constructor) =>
    isEndpointAvailable(constructor, workspaceConfiguration, inputCondition)
  );
}
