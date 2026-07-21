import { defineDustBatchEndpoint } from "@app/lib/llms/batch/dust_batch_endpoint";
import { AnthropicClaudeSonnetFourDotSixGlobalAnthropicBatch } from "@app/lib/model_constructors/batch/endpoints/anthropic_claude_sonnet_four_dot_six_global_anthropic";

export class DustAnthropicClaudeSonnetFourDotSixGlobalAnthropicBatch extends AnthropicClaudeSonnetFourDotSixGlobalAnthropicBatch {
  static readonly endpointFilter = {};
}

defineDustBatchEndpoint(
  DustAnthropicClaudeSonnetFourDotSixGlobalAnthropicBatch
);
