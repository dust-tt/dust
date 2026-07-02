import type { DustStreamEndpointConstructor } from "@app/lib/llms/stream/dust_stream_endpoint";
import { DustAgentPlatformEuropeClaudeHaikuFourDotFiveStream } from "@app/lib/llms/stream/endpoints/agent_platform_eu_claude_haiku_four_dot_five";
import { DustAgentPlatformEuropeClaudeSonnetFourDotSixStream } from "@app/lib/llms/stream/endpoints/agent_platform_eu_claude_sonnet_four_dot_six";
import { DustAgentPlatformEuropeGeminiThreeDotOneFlashLiteStream } from "@app/lib/llms/stream/endpoints/agent_platform_eu_gemini_3_1_flash_lite";
import { DustAgentPlatformEuropeGeminiThreeDotFiveFlashStream } from "@app/lib/llms/stream/endpoints/agent_platform_eu_gemini_3_5_flash";
import { DustAnthropicUsClaudeHaikuFourDotFiveStream } from "@app/lib/llms/stream/endpoints/anthropic_us_claude_haiku_four_dot_five";
import { DustAnthropicUsClaudeOpusFourDotEightStream } from "@app/lib/llms/stream/endpoints/anthropic_us_claude_opus_four_dot_eight";
import { DustAnthropicUsClaudeOpusFourDotSevenStream } from "@app/lib/llms/stream/endpoints/anthropic_us_claude_opus_four_dot_seven";
import { DustAnthropicUsClaudeOpusFourDotSixStream } from "@app/lib/llms/stream/endpoints/anthropic_us_claude_opus_four_dot_six";
import { DustAnthropicUsClaudeSonnetFiveStream } from "@app/lib/llms/stream/endpoints/anthropic_us_claude_sonnet_five";
import { DustAnthropicUsClaudeSonnetFourDotSixStream } from "@app/lib/llms/stream/endpoints/anthropic_us_claude_sonnet_four_dot_six";
import { DustFireworksUsDeepSeekV4ProStream } from "@app/lib/llms/stream/endpoints/fireworks_us_deepseek_v4_pro";
import { DustFireworksUsGlmFiveDotTwoStream } from "@app/lib/llms/stream/endpoints/fireworks_us_glm_five_dot_two";
import { DustFireworksUsKimiK2Dot5Stream } from "@app/lib/llms/stream/endpoints/fireworks_us_kimi_k2_dot_five";
import { DustGoogleAiStudioUsGeminiThreeDotOneProStream } from "@app/lib/llms/stream/endpoints/google_ai_studio_us_gemini_3_1_pro";
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
import { DustTogetheraiUsLlama3370BInstructTurboStream } from "@app/lib/llms/stream/endpoints/togetherai_us_llama_3_3_70b_instruct_turbo";
import { isEndpointAvailable } from "@app/lib/llms/stream/utils/is_endpoint_available";
import type {
  EndpointConfig,
  Where,
  WorkspaceConfig,
} from "@app/lib/llms/types/filter";
import type { StreamEndpointId } from "@app/lib/model_constructors/stream";

export const DUST_STREAM_ENDPOINTS = {
  [DustAnthropicUsClaudeSonnetFiveStream.id]:
    DustAnthropicUsClaudeSonnetFiveStream,
  [DustAnthropicUsClaudeSonnetFourDotSixStream.id]:
    DustAnthropicUsClaudeSonnetFourDotSixStream,
  [DustAnthropicUsClaudeHaikuFourDotFiveStream.id]:
    DustAnthropicUsClaudeHaikuFourDotFiveStream,
  [DustAnthropicUsClaudeOpusFourDotEightStream.id]:
    DustAnthropicUsClaudeOpusFourDotEightStream,
  [DustAnthropicUsClaudeOpusFourDotSevenStream.id]:
    DustAnthropicUsClaudeOpusFourDotSevenStream,
  [DustAnthropicUsClaudeOpusFourDotSixStream.id]:
    DustAnthropicUsClaudeOpusFourDotSixStream,
  [DustAgentPlatformEuropeClaudeSonnetFourDotSixStream.id]:
    DustAgentPlatformEuropeClaudeSonnetFourDotSixStream,
  [DustAgentPlatformEuropeGeminiThreeDotFiveFlashStream.id]:
    DustAgentPlatformEuropeGeminiThreeDotFiveFlashStream,
  [DustAgentPlatformEuropeGeminiThreeDotOneFlashLiteStream.id]:
    DustAgentPlatformEuropeGeminiThreeDotOneFlashLiteStream,
  [DustGoogleAiStudioUsGeminiThreeDotOneProStream.id]:
    DustGoogleAiStudioUsGeminiThreeDotOneProStream,
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
  [DustFireworksUsGlmFiveDotTwoStream.id]: DustFireworksUsGlmFiveDotTwoStream,
  [DustFireworksUsDeepSeekV4ProStream.id]: DustFireworksUsDeepSeekV4ProStream,
  [DustFireworksUsKimiK2Dot5Stream.id]: DustFireworksUsKimiK2Dot5Stream,
  [DustTogetheraiUsLlama3370BInstructTurboStream.id]:
    DustTogetheraiUsLlama3370BInstructTurboStream,
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
