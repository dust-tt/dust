import { WithDustClaudeOpusFourDotSevenConfig } from "@app/lib/llms/providers/anthropic/models/claude_opus_four_dot_seven";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { EU_AGENT_PLATFORM_ENDPOINT_FILTER } from "@app/lib/llms/utils/endpoint_filters";
import { AnthropicClaudeOpusFourDotSevenEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_opus_four_dot_seven_eu_agent_platform";

export class DustAnthropicClaudeOpusFourDotSevenEuropeAgentPlatformStream extends WithDustClaudeOpusFourDotSevenConfig(
  AnthropicClaudeOpusFourDotSevenEuropeAgentPlatformStream
) {
  static readonly endpointFilter = EU_AGENT_PLATFORM_ENDPOINT_FILTER;
}

defineDustStreamEndpoint(
  DustAnthropicClaudeOpusFourDotSevenEuropeAgentPlatformStream
);
