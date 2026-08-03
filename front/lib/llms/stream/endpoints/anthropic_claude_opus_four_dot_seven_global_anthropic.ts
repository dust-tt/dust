import { WithDustClaudeOpusFourDotSevenConfig } from "@app/lib/llms/providers/anthropic/models/claude_opus_four_dot_seven";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicClaudeOpusFourDotSevenGlobalAnthropicStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_opus_four_dot_seven_global_anthropic";

export class DustAnthropicClaudeOpusFourDotSevenGlobalAnthropicStream extends WithDustClaudeOpusFourDotSevenConfig(
  AnthropicClaudeOpusFourDotSevenGlobalAnthropicStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustAnthropicClaudeOpusFourDotSevenGlobalAnthropicStream
);
