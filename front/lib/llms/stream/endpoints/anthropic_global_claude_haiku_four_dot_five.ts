import { WithDustClaudeHaikuFourDotFive } from "@app/lib/llms/providers/anthropic/models/claude_haiku_four_dot_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicGlobalClaudeHaikuFourDotFiveStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_haiku_four_dot_five";

export class DustAnthropicGlobalClaudeHaikuFourDotFiveStream extends WithDustClaudeHaikuFourDotFive(
  AnthropicGlobalClaudeHaikuFourDotFiveStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustAnthropicGlobalClaudeHaikuFourDotFiveStream);
