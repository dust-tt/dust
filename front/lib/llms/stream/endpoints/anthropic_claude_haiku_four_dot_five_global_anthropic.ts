import { WithDustClaudeHaikuFourDotFive } from "@app/lib/llms/providers/anthropic/models/claude_haiku_four_dot_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicClaudeHaikuFourDotFiveGlobalAnthropicStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_haiku_four_dot_five_global_anthropic";

export class DustAnthropicClaudeHaikuFourDotFiveGlobalAnthropicStream extends WithDustClaudeHaikuFourDotFive(
  AnthropicClaudeHaikuFourDotFiveGlobalAnthropicStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustAnthropicClaudeHaikuFourDotFiveGlobalAnthropicStream
);
