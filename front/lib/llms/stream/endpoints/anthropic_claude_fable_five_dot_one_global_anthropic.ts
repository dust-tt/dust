import { WithDustClaudeFableFiveDotOneConfig } from "@app/lib/llms/providers/anthropic/models/claude_fable_five_dot_one";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicClaudeFableFiveDotOneGlobalAnthropicStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_fable_five_dot_one_global_anthropic";

export class DustAnthropicClaudeFableFiveDotOneGlobalAnthropicStream extends WithDustClaudeFableFiveDotOneConfig(
  AnthropicClaudeFableFiveDotOneGlobalAnthropicStream
) {
  // Gating is inherited from Fable 5: the family stays behind the same flag.
  static readonly endpointFilter = {
    featureFlags: { contains: "claude_fable_5_feature" as const },
  };
}

defineDustStreamEndpoint(
  DustAnthropicClaudeFableFiveDotOneGlobalAnthropicStream
);
