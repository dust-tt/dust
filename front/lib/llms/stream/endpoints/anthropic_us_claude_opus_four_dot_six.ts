import { WithDustClaudeOpusFourDotSixConfig } from "@app/lib/llms/providers/anthropic/models/claude_opus_four_dot_six";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicUsClaudeOpusFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_us_claude_opus_four_dot_six";

export class DustAnthropicUsClaudeOpusFourDotSixStream extends WithDustClaudeOpusFourDotSixConfig(
  AnthropicUsClaudeOpusFourDotSixStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustAnthropicUsClaudeOpusFourDotSixStream);
