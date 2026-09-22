import { WithDustClaudeOpusFiveConfig } from "@app/lib/llms/providers/anthropic/models/claude_opus_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { PREMIUM_MODEL_ENDPOINT_FILTER } from "@app/lib/llms/utils/endpoint_filters";
import { AnthropicClaudeOpusFiveGlobalAnthropicStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_opus_five_global_anthropic";

export class DustAnthropicClaudeOpusFiveGlobalAnthropicStream extends WithDustClaudeOpusFiveConfig(
  AnthropicClaudeOpusFiveGlobalAnthropicStream
) {
  static readonly endpointFilter = PREMIUM_MODEL_ENDPOINT_FILTER;
}

defineDustStreamEndpoint(DustAnthropicClaudeOpusFiveGlobalAnthropicStream);
