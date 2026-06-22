import type { DustStreamEndpointConstructor } from "@app/lib/llms/stream/dust_stream_endpoint";
import { DustAgentPlatformEuropeClaudeHaikuFourDotFiveStream } from "@app/lib/llms/stream/endpoints/agent_platform_eu_claude_haiku_four_dot_five";
import { DustAgentPlatformEuropeClaudeSonnetFourDotSixStream } from "@app/lib/llms/stream/endpoints/agent_platform_eu_claude_sonnet_four_dot_six";
import { DustAnthropicGlobalClaudeOpusFourDotEightStream } from "@app/lib/llms/stream/endpoints/anthropic_global_claude_opus_four_dot_eight";
import { DustAnthropicGlobalClaudeOpusFourDotSevenStream } from "@app/lib/llms/stream/endpoints/anthropic_global_claude_opus_four_dot_seven";
import { DustAnthropicGlobalClaudeOpusFourDotSixStream } from "@app/lib/llms/stream/endpoints/anthropic_global_claude_opus_four_dot_six";
import { DustAnthropicGlobalClaudeSonnetFourDotSixStream } from "@app/lib/llms/stream/endpoints/anthropic_global_claude_sonnet_four_dot_six";
import { DustFireworksGlobalDeepSeekV4ProStream } from "@app/lib/llms/stream/endpoints/fireworks_global_deepseek_v4_pro";
import { DustFireworksGlobalGlmFiveDotTwoStream } from "@app/lib/llms/stream/endpoints/fireworks_global_glm_five_dot_two";
import { DustFireworksGlobalKimiK2Dot5Stream } from "@app/lib/llms/stream/endpoints/fireworks_global_kimi_k2_dot_five";
import { DustGoogleAiStudioGlobalGeminiThreeDotOneFlashLiteStream } from "@app/lib/llms/stream/endpoints/google_ai_studio_global_gemini_3_1_flash_lite";
import { DustGoogleAiStudioGlobalGeminiThreeDotOneProStream } from "@app/lib/llms/stream/endpoints/google_ai_studio_global_gemini_3_1_pro";
import { DustGoogleAiStudioGlobalGeminiThreeDotFiveFlashStream } from "@app/lib/llms/stream/endpoints/google_ai_studio_global_gemini_3_5_flash";
import { DustOpenAIResponsesGlobalGptFiveStream } from "@app/lib/llms/stream/endpoints/openai_responses_global_gpt_five";
import { DustOpenAIResponsesGlobalGptFiveDotFiveStream } from "@app/lib/llms/stream/endpoints/openai_responses_global_gpt_five_dot_five";
import { DustOpenAIResponsesGlobalGptFiveDotFourStream } from "@app/lib/llms/stream/endpoints/openai_responses_global_gpt_five_dot_four";
import { DustOpenAIResponsesGlobalGptFiveDotFourMiniStream } from "@app/lib/llms/stream/endpoints/openai_responses_global_gpt_five_dot_four_mini";
import { DustOpenAIResponsesGlobalGptFiveDotFourNanoStream } from "@app/lib/llms/stream/endpoints/openai_responses_global_gpt_five_dot_four_nano";
import { DustOpenAIResponsesGlobalGptFiveDotOneStream } from "@app/lib/llms/stream/endpoints/openai_responses_global_gpt_five_dot_one";
import { DustOpenAIResponsesGlobalGptFiveDotTwoStream } from "@app/lib/llms/stream/endpoints/openai_responses_global_gpt_five_dot_two";
import { DustOpenAIResponsesGlobalGptFiveMiniStream } from "@app/lib/llms/stream/endpoints/openai_responses_global_gpt_five_mini";
import { DustOpenAIResponsesGlobalGptFiveNanoStream } from "@app/lib/llms/stream/endpoints/openai_responses_global_gpt_five_nano";
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
  [DustAnthropicGlobalClaudeOpusFourDotSevenStream.id]:
    DustAnthropicGlobalClaudeOpusFourDotSevenStream,
  [DustAnthropicGlobalClaudeOpusFourDotSixStream.id]:
    DustAnthropicGlobalClaudeOpusFourDotSixStream,
  [DustAgentPlatformEuropeClaudeSonnetFourDotSixStream.id]:
    DustAgentPlatformEuropeClaudeSonnetFourDotSixStream,
  [DustGoogleAiStudioGlobalGeminiThreeDotOneProStream.id]:
    DustGoogleAiStudioGlobalGeminiThreeDotOneProStream,
  [DustGoogleAiStudioGlobalGeminiThreeDotFiveFlashStream.id]:
    DustGoogleAiStudioGlobalGeminiThreeDotFiveFlashStream,
  [DustOpenAIResponsesGlobalGptFiveDotFiveStream.id]:
    DustOpenAIResponsesGlobalGptFiveDotFiveStream,
  [DustOpenAIResponsesGlobalGptFiveDotFourStream.id]:
    DustOpenAIResponsesGlobalGptFiveDotFourStream,
  [DustOpenAIResponsesGlobalGptFiveDotTwoStream.id]:
    DustOpenAIResponsesGlobalGptFiveDotTwoStream,
  [DustOpenAIResponsesGlobalGptFiveStream.id]:
    DustOpenAIResponsesGlobalGptFiveStream,
  [DustOpenAIResponsesGlobalGptFiveDotOneStream.id]:
    DustOpenAIResponsesGlobalGptFiveDotOneStream,
  [DustOpenAIResponsesGlobalGptFiveDotFourMiniStream.id]:
    DustOpenAIResponsesGlobalGptFiveDotFourMiniStream,
  [DustOpenAIResponsesGlobalGptFiveDotFourNanoStream.id]:
    DustOpenAIResponsesGlobalGptFiveDotFourNanoStream,
  [DustOpenAIResponsesGlobalGptFiveMiniStream.id]:
    DustOpenAIResponsesGlobalGptFiveMiniStream,
  [DustOpenAIResponsesGlobalGptFiveNanoStream.id]:
    DustOpenAIResponsesGlobalGptFiveNanoStream,
  [DustAgentPlatformEuropeClaudeHaikuFourDotFiveStream.id]:
    DustAgentPlatformEuropeClaudeHaikuFourDotFiveStream,
  [DustGoogleAiStudioGlobalGeminiThreeDotOneFlashLiteStream.id]:
    DustGoogleAiStudioGlobalGeminiThreeDotOneFlashLiteStream,
  [DustFireworksGlobalGlmFiveDotTwoStream.id]:
    DustFireworksGlobalGlmFiveDotTwoStream,
  [DustFireworksGlobalDeepSeekV4ProStream.id]:
    DustFireworksGlobalDeepSeekV4ProStream,
  [DustFireworksGlobalKimiK2Dot5Stream.id]: DustFireworksGlobalKimiK2Dot5Stream,
} as const satisfies Record<StreamEndpointId, DustStreamEndpointConstructor>;

export function getStreamEndpoints(
  workspaceConfiguration: WorkspaceConfig,
  inputCondition: Where<EndpointConfig>
) {
  return Object.values(DUST_STREAM_ENDPOINTS).filter((constructor) =>
    isEndpointAvailable(constructor, workspaceConfiguration, inputCondition)
  );
}
