import { WithDustClaudeOpusFourDotEightConfig } from "@app/lib/llms/providers/anthropic/models/claude_opus_four_dot_eight";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicClaudeOpusFourDotEightEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_opus_four_dot_eight_eu_agent_platform";

export class DustAgentPlatformEuropeClaudeOpusFourDotEightStream extends WithDustClaudeOpusFourDotEightConfig(
  AnthropicClaudeOpusFourDotEightEuropeAgentPlatformStream
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
