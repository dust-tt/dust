import { WithDustClaudeOpusFourDotEightConfig } from "@app/lib/llms/providers/anthropic/models/claude_opus_four_dot_eight";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicUsClaudeOpusFourDotEightStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_us_claude_opus_four_dot_eight";

export class DustAnthropicUsClaudeOpusFourDotEightStream extends WithDustClaudeOpusFourDotEightConfig(
  AnthropicUsClaudeOpusFourDotEightStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustAnthropicUsClaudeOpusFourDotEightStream);
