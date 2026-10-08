import { WithDustClaudeHaikuFiveDotFiveConfig } from "@app/lib/llms/providers/anthropic/models/claude_haiku_five_dot_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicClaudeHaikuFiveDotFiveGlobalAnthropicStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_haiku_five_dot_five_global_anthropic";

export class DustAnthropicClaudeHaikuFiveDotFiveGlobalAnthropicStream extends WithDustClaudeHaikuFiveDotFiveConfig(
  AnthropicClaudeHaikuFiveDotFiveGlobalAnthropicStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustAnthropicClaudeHaikuFiveDotFiveGlobalAnthropicStream
);
