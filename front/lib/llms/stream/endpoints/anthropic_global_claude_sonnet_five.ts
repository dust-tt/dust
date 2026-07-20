import { WithDustClaudeSonnetFiveConfig } from "@app/lib/llms/providers/anthropic/models/claude_sonnet_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicClaudeSonnetFiveGlobalAnthropicStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_sonnet_five_global_anthropic";

export class DustAnthropicGlobalClaudeSonnetFiveStream extends WithDustClaudeSonnetFiveConfig(
  AnthropicClaudeSonnetFiveGlobalAnthropicStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustAnthropicGlobalClaudeSonnetFiveStream);
