import { WithDustClaudeSonnetFourDotSixConfig } from "@app/lib/llms/providers/anthropic/models/claude_sonnet_four_dot_six";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicUsClaudeSonnetFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_us_claude_sonnet_four_dot_six";

export class DustAnthropicUsClaudeSonnetFourDotSixStream extends WithDustClaudeSonnetFourDotSixConfig(
  AnthropicUsClaudeSonnetFourDotSixStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustAnthropicUsClaudeSonnetFourDotSixStream);
