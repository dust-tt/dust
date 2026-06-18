import type { DustStreamEndpointConstructor } from "@app/lib/llms/stream/dust_stream_endpoint";
import { DustAgentPlatformEuropeClaudeSonnetFourDotSixStream } from "@app/lib/llms/stream/endpoints/agent_platform_eu_claude_sonnet_four_dot_six";
import { DustAnthropicGlobalClaudeSonnetFourDotSixStream } from "@app/lib/llms/stream/endpoints/anthropic_global_claude_sonnet_four_dot_six";
import { DustOpenAIResponsesGlobalGptFiveDotFiveStream } from "@app/lib/llms/stream/endpoints/openai_responses_global_gpt_five_dot_five";
import { isEndpointAvailable } from "@app/lib/llms/stream/utils/is_endpoint_available";
import type {
  EndpointConfig,
  Where,
  WorkspaceConfig,
} from "@app/lib/llms/types/filter";
import type { StreamEndpointId } from "@app/lib/model_constructors/stream";

export const DUST_STREAM_ENDPOINTS = {
  [DustAnthropicGlobalClaudeSonnetFourDotSixStream.id]:
    DustAnthropicGlobalClaudeSonnetFourDotSixStream,
  [DustAgentPlatformEuropeClaudeSonnetFourDotSixStream.id]:
    DustAgentPlatformEuropeClaudeSonnetFourDotSixStream,
  [DustOpenAIResponsesGlobalGptFiveDotFiveStream.id]:
    DustOpenAIResponsesGlobalGptFiveDotFiveStream,
} as const satisfies Record<StreamEndpointId, DustStreamEndpointConstructor>;

export function getStreamEndpoints(
  workspaceConfiguration: WorkspaceConfig,
  inputCondition: Where<EndpointConfig>
) {
  return Object.values(DUST_STREAM_ENDPOINTS).filter((constructor) =>
    isEndpointAvailable(constructor, workspaceConfiguration, inputCondition)
  );
}
