import { WithDustClaudeOpusFourDotSixConfig } from "@app/lib/llms/providers/anthropic/models/claude_opus_four_dot_six";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import {
  EU_AGENT_PLATFORM_ENDPOINT_FILTER,
  PREMIUM_MODEL_ENDPOINT_FILTER,
} from "@app/lib/llms/utils/endpoint_filters";
import { AnthropicClaudeOpusFourDotSixEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_opus_four_dot_six_eu_agent_platform";

export class DustAnthropicClaudeOpusFourDotSixEuropeAgentPlatformStream extends WithDustClaudeOpusFourDotSixConfig(
  AnthropicClaudeOpusFourDotSixEuropeAgentPlatformStream
) {
  static readonly endpointFilter = {
    and: [EU_AGENT_PLATFORM_ENDPOINT_FILTER, PREMIUM_MODEL_ENDPOINT_FILTER],
  };
}

defineDustStreamEndpoint(
  DustAnthropicClaudeOpusFourDotSixEuropeAgentPlatformStream
);
