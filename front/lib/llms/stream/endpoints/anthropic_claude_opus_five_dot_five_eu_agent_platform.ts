import { WithDustClaudeOpusFiveDotFiveConfig } from "@app/lib/llms/providers/anthropic/models/claude_opus_five_dot_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { EU_AGENT_PLATFORM_ENDPOINT_FILTER } from "@app/lib/llms/utils/endpoint_filters";
import { AnthropicClaudeOpusFiveDotFiveEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_opus_five_dot_five_eu_agent_platform";

export class DustAnthropicClaudeOpusFiveDotFiveEuropeAgentPlatformStream extends WithDustClaudeOpusFiveDotFiveConfig(
  AnthropicClaudeOpusFiveDotFiveEuropeAgentPlatformStream
) {
  static readonly endpointFilter = EU_AGENT_PLATFORM_ENDPOINT_FILTER;
}

defineDustStreamEndpoint(
  DustAnthropicClaudeOpusFiveDotFiveEuropeAgentPlatformStream
);
