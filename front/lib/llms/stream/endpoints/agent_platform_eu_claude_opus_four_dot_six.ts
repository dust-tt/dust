import { WithDustClaudeOpusFourDotSixConfig } from "@app/lib/llms/providers/anthropic/models/claude_opus_four_dot_six";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AgentPlatformEuropeClaudeOpusFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_opus_four_dot_six";

export class DustAgentPlatformEuropeClaudeOpusFourDotSixStream extends WithDustClaudeOpusFourDotSixConfig(
  AgentPlatformEuropeClaudeOpusFourDotSixStream
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

defineDustStreamEndpoint(DustAgentPlatformEuropeClaudeOpusFourDotSixStream);
