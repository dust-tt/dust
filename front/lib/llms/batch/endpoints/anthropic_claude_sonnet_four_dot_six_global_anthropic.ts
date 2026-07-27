import { defineDustBatchEndpoint } from "@app/lib/llms/batch/dust_batch_endpoint";
import { AnthropicClaudeSonnetFourDotSixGlobalAnthropicBatch } from "@app/lib/model_constructors/batch/endpoints/anthropic_claude_sonnet_four_dot_six_global_anthropic";
import { CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";

export class DustAnthropicClaudeSonnetFourDotSixGlobalAnthropicBatch extends AnthropicClaudeSonnetFourDotSixGlobalAnthropicBatch {
  static readonly endpointFilter = {};
  static readonly modelConfig = CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG;
}

defineDustBatchEndpoint(
  DustAnthropicClaudeSonnetFourDotSixGlobalAnthropicBatch
);
