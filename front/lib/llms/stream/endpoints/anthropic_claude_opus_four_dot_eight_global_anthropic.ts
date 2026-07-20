import { WithDustClaudeOpusFourDotEightConfig } from "@app/lib/llms/providers/anthropic/models/claude_opus_four_dot_eight";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicClaudeOpusFourDotEightGlobalAnthropicStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_opus_four_dot_eight_global_anthropic";

export class DustAnthropicClaudeOpusFourDotEightGlobalAnthropicStream extends WithDustClaudeOpusFourDotEightConfig(
  AnthropicClaudeOpusFourDotEightGlobalAnthropicStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustAnthropicClaudeOpusFourDotEightGlobalAnthropicStream);
