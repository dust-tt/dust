import { WithDustClaudeFableFiveConfig } from "@app/lib/llms/providers/anthropic/models/claude_fable_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicClaudeFableFiveEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_fable_five_eu_agent_platform";

export class DustAnthropicClaudeFableFiveEuropeAgentPlatformStream extends WithDustClaudeFableFiveConfig(
  AnthropicClaudeFableFiveEuropeAgentPlatformStream
) {
  static readonly endpointFilter = {
    and: [
      { featureFlags: { contains: "claude_fable_5_feature" as const } },
      {
        or: [
          {
            featureFlags: {
              contains: "use_vertex_for_supported_models" as const,
            },
          },
          { isCreditPriced: { eq: true } },
        ],
      },
    ],
  };
}

defineDustStreamEndpoint(DustAnthropicClaudeFableFiveEuropeAgentPlatformStream);
