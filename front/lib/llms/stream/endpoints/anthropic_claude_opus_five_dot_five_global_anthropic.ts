import { WithDustClaudeOpusFiveDotFiveConfig } from "@app/lib/llms/providers/anthropic/models/claude_opus_five_dot_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicClaudeOpusFiveDotFiveGlobalAnthropicStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_opus_five_dot_five_global_anthropic";

export class DustAnthropicClaudeOpusFiveDotFiveGlobalAnthropicStream extends WithDustClaudeOpusFiveDotFiveConfig(
  AnthropicClaudeOpusFiveDotFiveGlobalAnthropicStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustAnthropicClaudeOpusFiveDotFiveGlobalAnthropicStream
);
