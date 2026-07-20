import { WithDustClaudeSonnetFourDotSixConfig } from "@app/lib/llms/providers/anthropic/models/claude_sonnet_four_dot_six";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicClaudeSonnetFourDotSixGlobalAnthropicStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_sonnet_four_dot_six_global_anthropic";

export class DustAnthropicGlobalClaudeSonnetFourDotSixStream extends WithDustClaudeSonnetFourDotSixConfig(
  AnthropicClaudeSonnetFourDotSixGlobalAnthropicStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustAnthropicGlobalClaudeSonnetFourDotSixStream);
