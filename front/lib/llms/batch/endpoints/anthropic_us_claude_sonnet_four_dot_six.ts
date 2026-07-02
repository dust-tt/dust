import { defineDustBatchEndpoint } from "@app/lib/llms/batch/dust_batch_endpoint";
import { AnthropicUsClaudeSonnetFourDotSixBatch } from "@app/lib/model_constructors/batch/endpoints/anthropic_us_claude_sonnet_four_dot_six";

export class DustAnthropicUsClaudeSonnetFourDotSixBatch extends AnthropicUsClaudeSonnetFourDotSixBatch {
  static readonly endpointFilter = {};
}

defineDustBatchEndpoint(DustAnthropicUsClaudeSonnetFourDotSixBatch);
