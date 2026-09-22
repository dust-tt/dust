import { WithDustClaudeOpusFiveConfig } from "@app/lib/llms/providers/anthropic/models/claude_opus_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import {
  EU_AGENT_PLATFORM_ENDPOINT_FILTER,
  PREMIUM_MODEL_ENDPOINT_FILTER,
} from "@app/lib/llms/utils/endpoint_filters";
import { AnthropicClaudeOpusFiveEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_opus_five_eu_agent_platform";

export class DustAnthropicClaudeOpusFiveEuropeAgentPlatformStream extends WithDustClaudeOpusFiveConfig(
  AnthropicClaudeOpusFiveEuropeAgentPlatformStream
) {
  static readonly endpointFilter = {
    and: [EU_AGENT_PLATFORM_ENDPOINT_FILTER, PREMIUM_MODEL_ENDPOINT_FILTER],
  };
}

defineDustStreamEndpoint(DustAnthropicClaudeOpusFiveEuropeAgentPlatformStream);
