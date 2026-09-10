import { WithDustClaudeOpusFiveConfig } from "@app/lib/llms/providers/anthropic/models/claude_opus_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicClaudeOpusFiveGlobalBedrockStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_opus_five_global_bedrock";

export class DustAnthropicClaudeOpusFiveGlobalBedrockStream extends WithDustClaudeOpusFiveConfig(
  AnthropicClaudeOpusFiveGlobalBedrockStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustAnthropicClaudeOpusFiveGlobalBedrockStream);
