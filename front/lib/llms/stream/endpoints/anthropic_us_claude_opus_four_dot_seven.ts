import { WithDustClaudeOpusFourDotSevenConfig } from "@app/lib/llms/providers/anthropic/models/claude_opus_four_dot_seven";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicUsClaudeOpusFourDotSevenStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_us_claude_opus_four_dot_seven";

export class DustAnthropicUsClaudeOpusFourDotSevenStream extends WithDustClaudeOpusFourDotSevenConfig(
  AnthropicUsClaudeOpusFourDotSevenStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustAnthropicUsClaudeOpusFourDotSevenStream);
