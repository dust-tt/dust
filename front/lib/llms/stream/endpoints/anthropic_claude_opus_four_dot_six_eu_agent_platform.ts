import { WithDustClaudeOpusFourDotSixConfig } from "@app/lib/llms/providers/anthropic/models/claude_opus_four_dot_six";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicClaudeOpusFourDotSixEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_opus_four_dot_six_eu_agent_platform";

export class DustAnthropicClaudeOpusFourDotSixEuropeAgentPlatformStream extends WithDustClaudeOpusFourDotSixConfig(
  AnthropicClaudeOpusFourDotSixEuropeAgentPlatformStream
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
  DustAnthropicClaudeOpusFourDotSixEuropeAgentPlatformStream
);
