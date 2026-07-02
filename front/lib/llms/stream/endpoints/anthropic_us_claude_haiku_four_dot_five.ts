import { WithDustClaudeHaikuFourDotFive } from "@app/lib/llms/providers/anthropic/models/claude_haiku_four_dot_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicUsClaudeHaikuFourDotFiveStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_us_claude_haiku_four_dot_five";

export class DustAnthropicUsClaudeHaikuFourDotFiveStream extends WithDustClaudeHaikuFourDotFive(
  AnthropicUsClaudeHaikuFourDotFiveStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustAnthropicUsClaudeHaikuFourDotFiveStream);
