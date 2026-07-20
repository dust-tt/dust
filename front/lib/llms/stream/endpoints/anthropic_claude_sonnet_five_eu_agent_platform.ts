import { WithDustClaudeSonnetFiveConfig } from "@app/lib/llms/providers/anthropic/models/claude_sonnet_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicClaudeSonnetFiveEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_sonnet_five_eu_agent_platform";

export class DustAnthropicClaudeSonnetFiveEuropeAgentPlatformStream extends WithDustClaudeSonnetFiveConfig(
  AnthropicClaudeSonnetFiveEuropeAgentPlatformStream
) {
  static readonly endpointFilter = {
    or: [
      {
        featureFlags: { contains: "use_vertex_for_supported_models" as const },
      },
      { isCreditPriced: { eq: true } },
    ],
  };
}

defineDustStreamEndpoint(
  DustAnthropicClaudeSonnetFiveEuropeAgentPlatformStream
);
