import type { DustStreamEndpointConstructor } from "@app/lib/llms/stream/dust_stream_endpoint";
import { DustAgentPlatformEuropeClaudeHaikuFourDotFiveStream } from "@app/lib/llms/stream/endpoints/agent_platform_eu_claude_haiku_four_dot_five";
import { DustAgentPlatformEuropeClaudeSonnetFourDotSixStream } from "@app/lib/llms/stream/endpoints/agent_platform_eu_claude_sonnet_four_dot_six";
import { DustAnthropicGlobalClaudeOpusFourDotEightStream } from "@app/lib/llms/stream/endpoints/anthropic_global_claude_opus_four_dot_eight";
import { DustAnthropicGlobalClaudeSonnetFourDotSixStream } from "@app/lib/llms/stream/endpoints/anthropic_global_claude_sonnet_four_dot_six";
import { DustGoogleAiStudioGlobalGemini31ProStream } from "@app/lib/llms/stream/endpoints/google_ai_studio_global_gemini_3_1_pro";
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
  [DustAnthropicGlobalClaudeOpusFourDotEightStream.id]:
    DustAnthropicGlobalClaudeOpusFourDotEightStream,
  [DustAgentPlatformEuropeClaudeSonnetFourDotSixStream.id]:
    DustAgentPlatformEuropeClaudeSonnetFourDotSixStream,
  [DustGoogleAiStudioGlobalGemini31ProStream.id]:
    DustGoogleAiStudioGlobalGemini31ProStream,
  [DustOpenAIResponsesGlobalGptFiveDotFiveStream.id]:
    DustOpenAIResponsesGlobalGptFiveDotFiveStream,
  [DustAgentPlatformEuropeClaudeHaikuFourDotFiveStream.id]:
    DustAgentPlatformEuropeClaudeHaikuFourDotFiveStream,
} as const satisfies Record<StreamEndpointId, DustStreamEndpointConstructor>;

export function getStreamEndpoints(
  workspaceConfiguration: WorkspaceConfig,
  inputCondition: Where<EndpointConfig>
) {
  return Object.values(DUST_STREAM_ENDPOINTS).filter((constructor) =>
    isEndpointAvailable(constructor, workspaceConfiguration, inputCondition)
  );
}
