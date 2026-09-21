import { WithDustClaudeHaikuFourDotFive } from "@app/lib/llms/providers/anthropic/models/claude_haiku_four_dot_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { EU_AGENT_PLATFORM_ENDPOINT_FILTER } from "@app/lib/llms/utils/endpoint_filters";
import { AnthropicClaudeHaikuFourDotFiveEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_haiku_four_dot_five_eu_agent_platform";

export class DustAnthropicClaudeHaikuFourDotFiveEuropeAgentPlatformStream extends WithDustClaudeHaikuFourDotFive(
  AnthropicClaudeHaikuFourDotFiveEuropeAgentPlatformStream
) {
  static readonly endpointFilter = EU_AGENT_PLATFORM_ENDPOINT_FILTER;
}

defineDustStreamEndpoint(
  DustAnthropicClaudeHaikuFourDotFiveEuropeAgentPlatformStream
);
