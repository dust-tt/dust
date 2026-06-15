import { WithDustClaudeSonnetFourDotSixConfig } from "@app/lib/llms/providers/anthropic/models/claude_sonnet_four_dot_six";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicGlobalClaudeSonnetFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_sonnet_four_dot_six";

export class DustAnthropicGlobalClaudeSonnetFourDotSixStream extends WithDustClaudeSonnetFourDotSixConfig(
  AnthropicGlobalClaudeSonnetFourDotSixStream
) {}

defineDustStreamEndpoint(DustAnthropicGlobalClaudeSonnetFourDotSixStream);
