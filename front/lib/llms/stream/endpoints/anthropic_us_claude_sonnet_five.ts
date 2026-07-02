import { WithDustClaudeSonnetFiveConfig } from "@app/lib/llms/providers/anthropic/models/claude_sonnet_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicUsClaudeSonnetFiveStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_us_claude_sonnet_five";

export class DustAnthropicUsClaudeSonnetFiveStream extends WithDustClaudeSonnetFiveConfig(
  AnthropicUsClaudeSonnetFiveStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustAnthropicUsClaudeSonnetFiveStream);
