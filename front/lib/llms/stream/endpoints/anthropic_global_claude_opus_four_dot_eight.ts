import { WithDustClaudeOpusFourDotEightConfig } from "@app/lib/llms/providers/anthropic/models/claude_opus_four_dot_eight";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicGlobalClaudeOpusFourDotEightStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_opus_four_dot_eight";

export class DustAnthropicGlobalClaudeOpusFourDotEightStream extends WithDustClaudeOpusFourDotEightConfig(
  AnthropicGlobalClaudeOpusFourDotEightStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustAnthropicGlobalClaudeOpusFourDotEightStream);
