import { WithDustClaudeOpusFourDotSixConfig } from "@app/lib/llms/providers/anthropic/models/claude_opus_four_dot_six";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicGlobalClaudeOpusFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_opus_four_dot_six";

export class DustAnthropicGlobalClaudeOpusFourDotSixStream extends WithDustClaudeOpusFourDotSixConfig(
  AnthropicGlobalClaudeOpusFourDotSixStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustAnthropicGlobalClaudeOpusFourDotSixStream);
