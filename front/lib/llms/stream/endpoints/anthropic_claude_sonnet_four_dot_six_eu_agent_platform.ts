import { WithDustClaudeSonnetFourDotSixConfig } from "@app/lib/llms/providers/anthropic/models/claude_sonnet_four_dot_six";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { EU_AGENT_PLATFORM_ENDPOINT_FILTER } from "@app/lib/llms/utils/endpoint_filters";
import { AnthropicClaudeSonnetFourDotSixEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_sonnet_four_dot_six_eu_agent_platform";

export class DustAnthropicClaudeSonnetFourDotSixEuropeAgentPlatformStream extends WithDustClaudeSonnetFourDotSixConfig(
  AnthropicClaudeSonnetFourDotSixEuropeAgentPlatformStream
) {
  static readonly endpointFilter = EU_AGENT_PLATFORM_ENDPOINT_FILTER;
}

defineDustStreamEndpoint(
  DustAnthropicClaudeSonnetFourDotSixEuropeAgentPlatformStream
);
