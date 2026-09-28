import { WithDustClaudeSonnetFiveDotFiveConfig } from "@app/lib/llms/providers/anthropic/models/claude_sonnet_five_dot_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicClaudeSonnetFiveDotFiveGlobalAnthropicStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_sonnet_five_dot_five_global_anthropic";

export class DustAnthropicClaudeSonnetFiveDotFiveGlobalAnthropicStream extends WithDustClaudeSonnetFiveDotFiveConfig(
  AnthropicClaudeSonnetFiveDotFiveGlobalAnthropicStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustAnthropicClaudeSonnetFiveDotFiveGlobalAnthropicStream
);
