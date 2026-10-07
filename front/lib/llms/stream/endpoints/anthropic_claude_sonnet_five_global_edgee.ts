import { WithDustClaudeSonnetFiveConfig } from "@app/lib/llms/providers/anthropic/models/claude_sonnet_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicClaudeSonnetFiveGlobalEdgeeStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_sonnet_five_global_edgee";

export class DustAnthropicClaudeSonnetFiveGlobalEdgeeStream extends WithDustClaudeSonnetFiveConfig(
  AnthropicClaudeSonnetFiveGlobalEdgeeStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustAnthropicClaudeSonnetFiveGlobalEdgeeStream);
