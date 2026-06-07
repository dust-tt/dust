import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { AgentPlatformEuropeClaudeSonnetFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_agent_platform_eu_claude_sonnet_four_dot_six";
import { AnthropicGlobalClaudeSonnetFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_anthropic_global_claude_sonnet_four_dot_six";
import type { Filter } from "@app/lib/model_constructors/types/filter";
import { getFilteredEndpoints } from "@app/lib/model_constructors/utils/filter_endpoints";

export const STREAM_ENDPOINTS = {
  [AnthropicGlobalClaudeSonnetFourDotSixStream.id]:
    AnthropicGlobalClaudeSonnetFourDotSixStream,
  [AgentPlatformEuropeClaudeSonnetFourDotSixStream.id]:
    AgentPlatformEuropeClaudeSonnetFourDotSixStream,
} as const satisfies Record<string, StreamEndpointConstructor>;

export type StreamEndpointId = keyof typeof STREAM_ENDPOINTS;

export function getAvailableStreamEndpoints(
  filter: Filter
): StreamEndpointConstructor[] {
  if (!filter.featureFlags.includes("use_new_llm_router")) {
    return [];
  }

  return getFilteredEndpoints(Object.values(STREAM_ENDPOINTS), filter);
}
