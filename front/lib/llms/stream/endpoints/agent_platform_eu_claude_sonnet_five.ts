import { WithDustClaudeSonnetFiveConfig } from "@app/lib/llms/providers/anthropic/models/claude_sonnet_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AgentPlatformEuropeClaudeSonnetFiveStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_sonnet_five";

export class DustAgentPlatformEuropeClaudeSonnetFiveStream extends WithDustClaudeSonnetFiveConfig(
  AgentPlatformEuropeClaudeSonnetFiveStream
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

defineDustStreamEndpoint(DustAgentPlatformEuropeClaudeSonnetFiveStream);
