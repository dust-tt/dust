import { WithDustClaudeOpusFourDotSixConfig } from "@app/lib/llms/providers/anthropic/models/claude_opus_four_dot_six";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicClaudeOpusFourDotSixGlobalAnthropicStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_opus_four_dot_six_global_anthropic";

export class DustAnthropicClaudeOpusFourDotSixGlobalAnthropicStream extends WithDustClaudeOpusFourDotSixConfig(
  AnthropicClaudeOpusFourDotSixGlobalAnthropicStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustAnthropicClaudeOpusFourDotSixGlobalAnthropicStream);
