import { WithDustClaudeSonnetFiveConfig } from "@app/lib/llms/providers/anthropic/models/claude_sonnet_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicGlobalClaudeSonnetFiveStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_sonnet_five";

export class DustAnthropicGlobalClaudeSonnetFiveStream extends WithDustClaudeSonnetFiveConfig(
  AnthropicGlobalClaudeSonnetFiveStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustAnthropicGlobalClaudeSonnetFiveStream);
