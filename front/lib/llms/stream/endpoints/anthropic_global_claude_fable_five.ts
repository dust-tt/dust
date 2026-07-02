import { WithDustClaudeFableFiveConfig } from "@app/lib/llms/providers/anthropic/models/claude_fable_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicGlobalClaudeFableFiveStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_fable_five";

export class DustAnthropicGlobalClaudeFableFiveStream extends WithDustClaudeFableFiveConfig(
  AnthropicGlobalClaudeFableFiveStream
) {
  static readonly endpointFilter = {
    featureFlags: { contains: "claude_fable_5_feature" as const },
  };
}

defineDustStreamEndpoint(DustAnthropicGlobalClaudeFableFiveStream);
