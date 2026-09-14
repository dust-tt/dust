import { WithDustClaudeOpusFiveConfig } from "@app/lib/llms/providers/anthropic/models/claude_opus_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AnthropicClaudeOpusFiveEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_opus_five_eu_agent_platform";

export class DustAnthropicClaudeOpusFiveEuropeAgentPlatformStream extends WithDustClaudeOpusFiveConfig(
  AnthropicClaudeOpusFiveEuropeAgentPlatformStream
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

defineDustStreamEndpoint(DustAnthropicClaudeOpusFiveEuropeAgentPlatformStream);
