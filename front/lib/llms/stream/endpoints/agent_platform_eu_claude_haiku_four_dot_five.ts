import { WithDustClaudeHaikuFourDotFive } from "@app/lib/llms/providers/anthropic/models/claude_haiku_four_dot_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AgentPlatformEuropeClaudeHaikuFourDotFiveStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_haiku_four_dot_five";

export class DustAgentPlatformEuropeClaudeHaikuFourDotFiveStream extends WithDustClaudeHaikuFourDotFive(
  AgentPlatformEuropeClaudeHaikuFourDotFiveStream
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

defineDustStreamEndpoint(DustAgentPlatformEuropeClaudeHaikuFourDotFiveStream);
