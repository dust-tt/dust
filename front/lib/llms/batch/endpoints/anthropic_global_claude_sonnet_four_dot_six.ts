import { defineDustBatchEndpoint } from "@app/lib/llms/batch/dust_batch_endpoint";
import { AnthropicGlobalClaudeSonnetFourDotSixBatch } from "@app/lib/model_constructors/batch/endpoints/anthropic_global_claude_sonnet_four_dot_six";

export class DustAnthropicGlobalClaudeSonnetFourDotSixBatch extends AnthropicGlobalClaudeSonnetFourDotSixBatch {
  static readonly endpointFilter = {};
}

defineDustBatchEndpoint(DustAnthropicGlobalClaudeSonnetFourDotSixBatch);
