import type { DustStreamEndpointConstructor } from "@app/lib/llms/stream/dust_stream_endpoint";
import { DustAgentPlatformEuropeClaudeHaikuFourDotFiveStream } from "@app/lib/llms/stream/endpoints/agent_platform_eu_claude_haiku_four_dot_five";
import { DustAgentPlatformEuropeClaudeSonnetFourDotSixStream } from "@app/lib/llms/stream/endpoints/agent_platform_eu_claude_sonnet_four_dot_six";
import { DustAgentPlatformEuropeGeminiThreeDotOneFlashLiteStream } from "@app/lib/llms/stream/endpoints/agent_platform_eu_gemini_3_1_flash_lite";
import { DustAgentPlatformEuropeGeminiThreeDotOneProStream } from "@app/lib/llms/stream/endpoints/agent_platform_eu_gemini_3_1_pro";
import { DustAgentPlatformEuropeGeminiThreeDotFiveFlashStream } from "@app/lib/llms/stream/endpoints/agent_platform_eu_gemini_3_5_flash";
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
import { DustMistralEuropeCodestralStream } from "@app/lib/llms/stream/endpoints/mistral_eu_codestral";
import { DustMistralEuropeMistralLargeStream } from "@app/lib/llms/stream/endpoints/mistral_eu_mistral_large";
import { DustMistralEuropeMistralMedium35Stream } from "@app/lib/llms/stream/endpoints/mistral_eu_mistral_medium_3_5";
import { DustMistralEuropeMistralSmallStream } from "@app/lib/llms/stream/endpoints/mistral_eu_mistral_small";
import { DustOpenAIResponsesGlobalGptFiveStream } from "@app/lib/llms/stream/endpoints/openai_responses_global_gpt_five";
import { DustOpenAIResponsesGlobalGptFiveDotFiveStream } from "@app/lib/llms/stream/endpoints/openai_responses_global_gpt_five_dot_five";
import { DustOpenAIResponsesGlobalGptFiveDotFourStream } from "@app/lib/llms/stream/endpoints/openai_responses_global_gpt_five_dot_four";
import { DustOpenAIResponsesGlobalGptFiveDotFourMiniStream } from "@app/lib/llms/stream/endpoints/openai_responses_global_gpt_five_dot_four_mini";
import { DustOpenAIResponsesGlobalGptFiveDotFourNanoStream } from "@app/lib/llms/stream/endpoints/openai_responses_global_gpt_five_dot_four_nano";
import { DustOpenAIResponsesGlobalGptFiveDotOneStream } from "@app/lib/llms/stream/endpoints/openai_responses_global_gpt_five_dot_one";
import { DustOpenAIResponsesGlobalGptFiveDotTwoStream } from "@app/lib/llms/stream/endpoints/openai_responses_global_gpt_five_dot_two";
import { DustOpenAIResponsesGlobalGptFiveMiniStream } from "@app/lib/llms/stream/endpoints/openai_responses_global_gpt_five_mini";
import { DustOpenAIResponsesGlobalGptFiveNanoStream } from "@app/lib/llms/stream/endpoints/openai_responses_global_gpt_five_nano";
import { DustTogetheraiGlobalLlama3370BInstructTurboStream } from "@app/lib/llms/stream/endpoints/togetherai_global_llama_3_3_70b_instruct_turbo";
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
  [DustAgentPlatformEuropeGeminiThreeDotOneProStream.id]:
    DustAgentPlatformEuropeGeminiThreeDotOneProStream,
  [DustAgentPlatformEuropeGeminiThreeDotFiveFlashStream.id]:
    DustAgentPlatformEuropeGeminiThreeDotFiveFlashStream,
  [DustAgentPlatformEuropeGeminiThreeDotOneFlashLiteStream.id]:
    DustAgentPlatformEuropeGeminiThreeDotOneFlashLiteStream,
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
  [DustTogetheraiGlobalLlama3370BInstructTurboStream.id]:
    DustTogetheraiGlobalLlama3370BInstructTurboStream,
  [DustMistralEuropeMistralLargeStream.id]: DustMistralEuropeMistralLargeStream,
  [DustMistralEuropeMistralMedium35Stream.id]:
    DustMistralEuropeMistralMedium35Stream,
  [DustMistralEuropeMistralSmallStream.id]: DustMistralEuropeMistralSmallStream,
  [DustMistralEuropeCodestralStream.id]: DustMistralEuropeCodestralStream,
} as const satisfies Record<StreamEndpointId, DustStreamEndpointConstructor>;

export function getStreamEndpoints(
  workspaceConfiguration: WorkspaceConfig,
  inputCondition: Where<EndpointConfig>
) {
  return Object.values(DUST_STREAM_ENDPOINTS).filter((constructor) =>
    isEndpointAvailable(constructor, workspaceConfiguration, inputCondition)
  );
}
