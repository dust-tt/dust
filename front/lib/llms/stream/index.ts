import type { DustStreamEndpointConstructor } from "@app/lib/llms/stream/dust_stream_endpoint";
import { DustAgentPlatformEuropeClaudeHaikuFourDotFiveStream } from "@app/lib/llms/stream/endpoints/agent_platform_eu_claude_haiku_four_dot_five";
import { DustAgentPlatformEuropeClaudeOpusFourDotEightStream } from "@app/lib/llms/stream/endpoints/agent_platform_eu_claude_opus_four_dot_eight";
import { DustAgentPlatformEuropeClaudeOpusFourDotSevenStream } from "@app/lib/llms/stream/endpoints/agent_platform_eu_claude_opus_four_dot_seven";
import { DustAgentPlatformEuropeClaudeOpusFourDotSixStream } from "@app/lib/llms/stream/endpoints/agent_platform_eu_claude_opus_four_dot_six";
import { DustAgentPlatformEuropeClaudeSonnetFiveStream } from "@app/lib/llms/stream/endpoints/agent_platform_eu_claude_sonnet_five";
import { DustAgentPlatformEuropeClaudeSonnetFourDotSixStream } from "@app/lib/llms/stream/endpoints/agent_platform_eu_claude_sonnet_four_dot_six";
import { DustAgentPlatformEuropeGeminiThreeDotOneFlashLiteStream } from "@app/lib/llms/stream/endpoints/agent_platform_eu_gemini_3_1_flash_lite";
import { DustAgentPlatformEuropeGeminiThreeDotFiveFlashStream } from "@app/lib/llms/stream/endpoints/agent_platform_eu_gemini_3_5_flash";
import { DustAnthropicGlobalClaudeFableFiveStream } from "@app/lib/llms/stream/endpoints/anthropic_global_claude_fable_five";
import { DustAnthropicGlobalClaudeHaikuFourDotFiveStream } from "@app/lib/llms/stream/endpoints/anthropic_global_claude_haiku_four_dot_five";
import { DustAnthropicGlobalClaudeOpusFourDotEightStream } from "@app/lib/llms/stream/endpoints/anthropic_global_claude_opus_four_dot_eight";
import { DustAnthropicGlobalClaudeOpusFourDotSevenStream } from "@app/lib/llms/stream/endpoints/anthropic_global_claude_opus_four_dot_seven";
import { DustAnthropicGlobalClaudeOpusFourDotSixStream } from "@app/lib/llms/stream/endpoints/anthropic_global_claude_opus_four_dot_six";
import { DustAnthropicGlobalClaudeSonnetFiveStream } from "@app/lib/llms/stream/endpoints/anthropic_global_claude_sonnet_five";
import { DustAnthropicGlobalClaudeSonnetFourDotSixStream } from "@app/lib/llms/stream/endpoints/anthropic_global_claude_sonnet_four_dot_six";
import { DustFireworksGlobalDeepSeekV4ProStream } from "@app/lib/llms/stream/endpoints/fireworks_global_deepseek_v4_pro";
import { DustFireworksGlobalGlmFiveDotTwoStream } from "@app/lib/llms/stream/endpoints/fireworks_global_glm_five_dot_two";
import { DustFireworksGlobalKimiK2Dot5Stream } from "@app/lib/llms/stream/endpoints/fireworks_global_kimi_k2_dot_five";
import { DustGoogleAiStudioGlobalGeminiThreeDotOneProStream } from "@app/lib/llms/stream/endpoints/google_ai_studio_global_gemini_3_1_pro";
import { DustMistralEuropeCodestralStream } from "@app/lib/llms/stream/endpoints/mistral_eu_codestral";
import { DustMistralEuropeMistralLargeStream } from "@app/lib/llms/stream/endpoints/mistral_eu_mistral_large";
import { DustMistralEuropeMistralMedium35Stream } from "@app/lib/llms/stream/endpoints/mistral_eu_mistral_medium_3_5";
import { DustMistralEuropeMistralSmallStream } from "@app/lib/llms/stream/endpoints/mistral_eu_mistral_small";
import { DustNoopGlobalNoopStream } from "@app/lib/llms/stream/endpoints/noop_global_noop";
import { DustOpenAIResponsesEuropeGptFiveStream } from "@app/lib/llms/stream/endpoints/openai_responses_eu_gpt_five";
import { DustOpenAIResponsesEuropeGptFiveDotFiveStream } from "@app/lib/llms/stream/endpoints/openai_responses_eu_gpt_five_dot_five";
import { DustOpenAIResponsesEuropeGptFiveDotFourStream } from "@app/lib/llms/stream/endpoints/openai_responses_eu_gpt_five_dot_four";
import { DustOpenAIResponsesEuropeGptFiveDotFourMiniStream } from "@app/lib/llms/stream/endpoints/openai_responses_eu_gpt_five_dot_four_mini";
import { DustOpenAIResponsesEuropeGptFiveDotFourNanoStream } from "@app/lib/llms/stream/endpoints/openai_responses_eu_gpt_five_dot_four_nano";
import { DustOpenAIResponsesEuropeGptFiveDotOneStream } from "@app/lib/llms/stream/endpoints/openai_responses_eu_gpt_five_dot_one";
import { DustOpenAIResponsesEuropeGptFiveDotTwoStream } from "@app/lib/llms/stream/endpoints/openai_responses_eu_gpt_five_dot_two";
import { DustOpenAIResponsesEuropeGptFiveMiniStream } from "@app/lib/llms/stream/endpoints/openai_responses_eu_gpt_five_mini";
import { DustOpenAIResponsesEuropeGptFiveNanoStream } from "@app/lib/llms/stream/endpoints/openai_responses_eu_gpt_five_nano";
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
  [DustAgentPlatformEuropeClaudeHaikuFourDotFiveStream.id]:
    DustAgentPlatformEuropeClaudeHaikuFourDotFiveStream,
  [DustAgentPlatformEuropeClaudeOpusFourDotEightStream.id]:
    DustAgentPlatformEuropeClaudeOpusFourDotEightStream,
  [DustAgentPlatformEuropeClaudeOpusFourDotSevenStream.id]:
    DustAgentPlatformEuropeClaudeOpusFourDotSevenStream,
  [DustAgentPlatformEuropeClaudeOpusFourDotSixStream.id]:
    DustAgentPlatformEuropeClaudeOpusFourDotSixStream,
  [DustAgentPlatformEuropeClaudeSonnetFiveStream.id]:
    DustAgentPlatformEuropeClaudeSonnetFiveStream,
  [DustAgentPlatformEuropeClaudeSonnetFourDotSixStream.id]:
    DustAgentPlatformEuropeClaudeSonnetFourDotSixStream,
  [DustAgentPlatformEuropeGeminiThreeDotFiveFlashStream.id]:
    DustAgentPlatformEuropeGeminiThreeDotFiveFlashStream,
  [DustAgentPlatformEuropeGeminiThreeDotOneFlashLiteStream.id]:
    DustAgentPlatformEuropeGeminiThreeDotOneFlashLiteStream,
  [DustAnthropicGlobalClaudeFableFiveStream.id]:
    DustAnthropicGlobalClaudeFableFiveStream,
  [DustAnthropicGlobalClaudeHaikuFourDotFiveStream.id]:
    DustAnthropicGlobalClaudeHaikuFourDotFiveStream,
  [DustAnthropicGlobalClaudeOpusFourDotEightStream.id]:
    DustAnthropicGlobalClaudeOpusFourDotEightStream,
  [DustAnthropicGlobalClaudeOpusFourDotSevenStream.id]:
    DustAnthropicGlobalClaudeOpusFourDotSevenStream,
  [DustAnthropicGlobalClaudeOpusFourDotSixStream.id]:
    DustAnthropicGlobalClaudeOpusFourDotSixStream,
  [DustAnthropicGlobalClaudeSonnetFiveStream.id]:
    DustAnthropicGlobalClaudeSonnetFiveStream,
  [DustAnthropicGlobalClaudeSonnetFourDotSixStream.id]:
    DustAnthropicGlobalClaudeSonnetFourDotSixStream,
  [DustFireworksGlobalDeepSeekV4ProStream.id]:
    DustFireworksGlobalDeepSeekV4ProStream,
  [DustFireworksGlobalGlmFiveDotTwoStream.id]:
    DustFireworksGlobalGlmFiveDotTwoStream,
  [DustFireworksGlobalKimiK2Dot5Stream.id]: DustFireworksGlobalKimiK2Dot5Stream,
  [DustGoogleAiStudioGlobalGeminiThreeDotOneProStream.id]:
    DustGoogleAiStudioGlobalGeminiThreeDotOneProStream,
  [DustMistralEuropeCodestralStream.id]: DustMistralEuropeCodestralStream,
  [DustMistralEuropeMistralLargeStream.id]: DustMistralEuropeMistralLargeStream,
  [DustMistralEuropeMistralMedium35Stream.id]:
    DustMistralEuropeMistralMedium35Stream,
  [DustMistralEuropeMistralSmallStream.id]: DustMistralEuropeMistralSmallStream,
  [DustNoopGlobalNoopStream.id]: DustNoopGlobalNoopStream,
  [DustOpenAIResponsesEuropeGptFiveDotFiveStream.id]:
    DustOpenAIResponsesEuropeGptFiveDotFiveStream,
  [DustOpenAIResponsesEuropeGptFiveDotFourMiniStream.id]:
    DustOpenAIResponsesEuropeGptFiveDotFourMiniStream,
  [DustOpenAIResponsesEuropeGptFiveDotFourNanoStream.id]:
    DustOpenAIResponsesEuropeGptFiveDotFourNanoStream,
  [DustOpenAIResponsesEuropeGptFiveDotFourStream.id]:
    DustOpenAIResponsesEuropeGptFiveDotFourStream,
  [DustOpenAIResponsesEuropeGptFiveDotOneStream.id]:
    DustOpenAIResponsesEuropeGptFiveDotOneStream,
  [DustOpenAIResponsesEuropeGptFiveDotTwoStream.id]:
    DustOpenAIResponsesEuropeGptFiveDotTwoStream,
  [DustOpenAIResponsesEuropeGptFiveMiniStream.id]:
    DustOpenAIResponsesEuropeGptFiveMiniStream,
  [DustOpenAIResponsesEuropeGptFiveNanoStream.id]:
    DustOpenAIResponsesEuropeGptFiveNanoStream,
  [DustOpenAIResponsesEuropeGptFiveStream.id]:
    DustOpenAIResponsesEuropeGptFiveStream,
  [DustOpenAIResponsesGlobalGptFiveDotFiveStream.id]:
    DustOpenAIResponsesGlobalGptFiveDotFiveStream,
  [DustOpenAIResponsesGlobalGptFiveDotFourMiniStream.id]:
    DustOpenAIResponsesGlobalGptFiveDotFourMiniStream,
  [DustOpenAIResponsesGlobalGptFiveDotFourNanoStream.id]:
    DustOpenAIResponsesGlobalGptFiveDotFourNanoStream,
  [DustOpenAIResponsesGlobalGptFiveDotFourStream.id]:
    DustOpenAIResponsesGlobalGptFiveDotFourStream,
  [DustOpenAIResponsesGlobalGptFiveDotOneStream.id]:
    DustOpenAIResponsesGlobalGptFiveDotOneStream,
  [DustOpenAIResponsesGlobalGptFiveDotTwoStream.id]:
    DustOpenAIResponsesGlobalGptFiveDotTwoStream,
  [DustOpenAIResponsesGlobalGptFiveMiniStream.id]:
    DustOpenAIResponsesGlobalGptFiveMiniStream,
  [DustOpenAIResponsesGlobalGptFiveNanoStream.id]:
    DustOpenAIResponsesGlobalGptFiveNanoStream,
  [DustOpenAIResponsesGlobalGptFiveStream.id]:
    DustOpenAIResponsesGlobalGptFiveStream,
} as const satisfies Record<StreamEndpointId, DustStreamEndpointConstructor>;

export function getStreamEndpoints(
  workspaceConfiguration: WorkspaceConfig,
  inputCondition: Where<EndpointConfig>
) {
  return Object.values(DUST_STREAM_ENDPOINTS).filter((constructor) =>
    isEndpointAvailable(constructor, workspaceConfiguration, inputCondition)
  );
}
