import { WithDustClaudeOpusFourDotEightConfig } from "@app/lib/llms/providers/anthropic/models/claude_opus_four_dot_eight";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AgentPlatformEuropeClaudeOpusFourDotEightStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_opus_four_dot_eight";

export class DustAgentPlatformEuropeClaudeOpusFourDotEightStream extends WithDustClaudeOpusFourDotEightConfig(
  AgentPlatformEuropeClaudeOpusFourDotEightStream
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

defineDustStreamEndpoint(DustAgentPlatformEuropeClaudeOpusFourDotEightStream);
