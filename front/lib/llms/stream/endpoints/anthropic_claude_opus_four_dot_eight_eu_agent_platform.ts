import { WithDustClaudeOpusFourDotEightConfig } from "@app/lib/llms/providers/anthropic/models/claude_opus_four_dot_eight";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { EU_AGENT_PLATFORM_ENDPOINT_FILTER } from "@app/lib/llms/utils/endpoint_filters";
import { AnthropicClaudeOpusFourDotEightEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_opus_four_dot_eight_eu_agent_platform";

export class DustAnthropicClaudeOpusFourDotEightEuropeAgentPlatformStream extends WithDustClaudeOpusFourDotEightConfig(
  AnthropicClaudeOpusFourDotEightEuropeAgentPlatformStream
) {
  static readonly endpointFilter = EU_AGENT_PLATFORM_ENDPOINT_FILTER;
}

defineDustStreamEndpoint(
  DustAnthropicClaudeOpusFourDotEightEuropeAgentPlatformStream
);
