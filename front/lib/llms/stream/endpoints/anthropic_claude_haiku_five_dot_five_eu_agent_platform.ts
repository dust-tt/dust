import { WithDustClaudeHaikuFiveDotFiveConfig } from "@app/lib/llms/providers/anthropic/models/claude_haiku_five_dot_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { EU_AGENT_PLATFORM_ENDPOINT_FILTER } from "@app/lib/llms/utils/endpoint_filters";
import { AnthropicClaudeHaikuFiveDotFiveEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_haiku_five_dot_five_eu_agent_platform";

export class DustAnthropicClaudeHaikuFiveDotFiveEuropeAgentPlatformStream extends WithDustClaudeHaikuFiveDotFiveConfig(
  AnthropicClaudeHaikuFiveDotFiveEuropeAgentPlatformStream
) {
  static readonly endpointFilter = EU_AGENT_PLATFORM_ENDPOINT_FILTER;
}

defineDustStreamEndpoint(
  DustAnthropicClaudeHaikuFiveDotFiveEuropeAgentPlatformStream
);
