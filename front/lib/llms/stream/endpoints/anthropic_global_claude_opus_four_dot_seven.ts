import { WithDustClaudeOpusFourDotSevenConfig } from "@app/lib/llms/providers/anthropic/models/claude_opus_four_dot_seven";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicGlobalClaudeOpusFourDotSevenStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_opus_four_dot_seven";

export class DustAnthropicGlobalClaudeOpusFourDotSevenStream extends WithDustClaudeOpusFourDotSevenConfig(
  AnthropicGlobalClaudeOpusFourDotSevenStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustAnthropicGlobalClaudeOpusFourDotSevenStream);
