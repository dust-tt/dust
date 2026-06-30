import { defineDustBatchEndpoint } from "@app/lib/llms/batch/dust_batch_endpoint";
import { AnthropicGlobalClaudeSonnetFiveBatch } from "@app/lib/model_constructors/batch/endpoints/anthropic_global_claude_sonnet_five";

export class DustAnthropicGlobalClaudeSonnetFiveBatch extends AnthropicGlobalClaudeSonnetFiveBatch {
  static readonly endpointFilter = {};
}

defineDustBatchEndpoint(DustAnthropicGlobalClaudeSonnetFiveBatch);
