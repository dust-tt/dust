import { WithDustClaudeFableFiveConfig } from "@app/lib/llms/providers/anthropic/models/claude_fable_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicClaudeFableFiveGlobalAnthropicStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_fable_five_global_anthropic";

export class DustAnthropicClaudeFableFiveGlobalAnthropicStream extends WithDustClaudeFableFiveConfig(
  AnthropicClaudeFableFiveGlobalAnthropicStream
) {
  static readonly endpointFilter = {
    featureFlags: { contains: "claude_fable_5_feature" as const },
  };
}

defineDustStreamEndpoint(DustAnthropicClaudeFableFiveGlobalAnthropicStream);
