import type { DustStreamEndpointConstructor } from "@app/lib/llms/stream/dust_stream_endpoint";
import { DustAnthropicClaudeHaikuFourDotFiveEuropeAgentPlatformStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_haiku_four_dot_five_eu_agent_platform";
import { DustAnthropicClaudeOpusFourDotEightEuropeAgentPlatformStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_opus_four_dot_eight_eu_agent_platform";
import { DustAnthropicClaudeOpusFourDotSevenEuropeAgentPlatformStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_opus_four_dot_seven_eu_agent_platform";
import { DustAnthropicClaudeOpusFourDotSixEuropeAgentPlatformStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_opus_four_dot_six_eu_agent_platform";
import { DustAnthropicClaudeSonnetFiveEuropeAgentPlatformStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_sonnet_five_eu_agent_platform";
import { DustAnthropicClaudeSonnetFourDotSixEuropeAgentPlatformStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_sonnet_four_dot_six_eu_agent_platform";
import { DustGoogleAiStudioGeminiThreeDotOneFlashLiteEuropeAgentPlatformStream } from "@app/lib/llms/stream/endpoints/google_ai_studio_gemini_3_1_flash_lite_eu_agent_platform";
import { DustGoogleAiStudioGeminiThreeDotFiveFlashEuropeAgentPlatformStream } from "@app/lib/llms/stream/endpoints/google_ai_studio_gemini_3_5_flash_eu_agent_platform";
import { DustGoogleAiStudioGeminiThreeDotOneFlashLiteGlobalAgentPlatformStream } from "@app/lib/llms/stream/endpoints/google_ai_studio_gemini_3_1_flash_lite_global_agent_platform";
import { DustGoogleAiStudioGeminiThreeDotOneProGlobalAgentPlatformStream } from "@app/lib/llms/stream/endpoints/google_ai_studio_gemini_3_1_pro_global_agent_platform";
import { DustGoogleAiStudioGeminiThreeDotFiveFlashGlobalAgentPlatformStream } from "@app/lib/llms/stream/endpoints/google_ai_studio_gemini_3_5_flash_global_agent_platform";
import { DustAnthropicClaudeFableFiveGlobalAnthropicStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_fable_five_global_anthropic";
import { DustAnthropicClaudeHaikuFourDotFiveGlobalAnthropicStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_haiku_four_dot_five_global_anthropic";
import { DustAnthropicClaudeOpusFourDotEightGlobalAnthropicStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_opus_four_dot_eight_global_anthropic";
import { DustAnthropicClaudeOpusFourDotSevenGlobalAnthropicStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_opus_four_dot_seven_global_anthropic";
import { DustAnthropicClaudeOpusFourDotSixGlobalAnthropicStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_opus_four_dot_six_global_anthropic";
import { DustAnthropicClaudeSonnetFiveGlobalAnthropicStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_sonnet_five_global_anthropic";
import { DustAnthropicClaudeSonnetFourDotSixGlobalAnthropicStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_sonnet_four_dot_six_global_anthropic";
import { DustFireworksDeepSeekV4ProGlobalFireworksStream } from "@app/lib/llms/stream/endpoints/fireworks_deepseek_v4_pro_global_fireworks";
import { DustFireworksGlmFiveDotTwoGlobalFireworksStream } from "@app/lib/llms/stream/endpoints/fireworks_glm_five_dot_two_global_fireworks";
import { DustFireworksKimiK2Dot5GlobalFireworksStream } from "@app/lib/llms/stream/endpoints/fireworks_kimi_k2_dot_five_global_fireworks";
import { DustFireworksKimiK2Dot6GlobalFireworksStream } from "@app/lib/llms/stream/endpoints/fireworks_kimi_k2_dot_six_global_fireworks";
import { DustGoogleAiStudioGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioStream } from "@app/lib/llms/stream/endpoints/google_ai_studio_gemini_3_1_flash_lite_global_google_ai_studio";
import { DustGoogleAiStudioGeminiThreeDotOneProGlobalGoogleAiStudioStream } from "@app/lib/llms/stream/endpoints/google_ai_studio_gemini_3_1_pro_global_google_ai_studio";
import { DustGoogleAiStudioGeminiThreeDotFiveFlashGlobalGoogleAiStudioStream } from "@app/lib/llms/stream/endpoints/google_ai_studio_gemini_3_5_flash_global_google_ai_studio";
import { DustMistralCodestralEuropeMistralStream } from "@app/lib/llms/stream/endpoints/mistral_codestral_eu_mistral";
import { DustMistralMistralLargeEuropeMistralStream } from "@app/lib/llms/stream/endpoints/mistral_mistral_large_eu_mistral";
import { DustMistralMistralMedium35EuropeMistralStream } from "@app/lib/llms/stream/endpoints/mistral_mistral_medium_3_5_eu_mistral";
import { DustMistralMistralSmallEuropeMistralStream } from "@app/lib/llms/stream/endpoints/mistral_mistral_small_eu_mistral";
import { DustNoopNoopGlobalNoopStream } from "@app/lib/llms/stream/endpoints/noop_noop_global_noop";
import { DustOpenAIGptFiveEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_eu_openai_responses";
import { DustOpenAIGptFiveDotFiveEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_five_eu_openai_responses";
import { DustOpenAIGptFiveDotFourEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_four_eu_openai_responses";
import { DustOpenAIGptFiveDotFourMiniEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_four_mini_eu_openai_responses";
import { DustOpenAIGptFiveDotFourNanoEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_four_nano_eu_openai_responses";
import { DustOpenAIGptFiveDotOneEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_one_eu_openai_responses";
import { DustOpenAIGptFiveDotSixLunaEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_six_luna_eu_openai_responses";
import { DustOpenAIGptFiveDotSixSolEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_six_sol_eu_openai_responses";
import { DustOpenAIGptFiveDotSixTerraEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_six_terra_eu_openai_responses";
import { DustOpenAIGptFiveDotTwoEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_two_eu_openai_responses";
import { DustOpenAIGptFiveMiniEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_mini_eu_openai_responses";
import { DustOpenAIGptFiveNanoEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_nano_eu_openai_responses";
import { DustOpenAIGptFiveGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_global_openai_responses";
import { DustOpenAIGptFiveDotFiveGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_five_global_openai_responses";
import { DustOpenAIGptFiveDotFourGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_four_global_openai_responses";
import { DustOpenAIGptFiveDotFourMiniGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_four_mini_global_openai_responses";
import { DustOpenAIGptFiveDotFourNanoGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_four_nano_global_openai_responses";
import { DustOpenAIGptFiveDotOneGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_one_global_openai_responses";
import { DustOpenAIGptFiveDotSixLunaGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_six_luna_global_openai_responses";
import { DustOpenAIGptFiveDotSixSolGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_six_sol_global_openai_responses";
import { DustOpenAIGptFiveDotSixTerraGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_six_terra_global_openai_responses";
import { DustOpenAIGptFiveDotTwoGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_two_global_openai_responses";
import { DustOpenAIGptFiveMiniGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_mini_global_openai_responses";
import { DustOpenAIGptFiveNanoGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_nano_global_openai_responses";
import { isEndpointAvailable } from "@app/lib/llms/stream/utils/is_endpoint_available";
import type {
  EndpointConfig,
  Where,
  WorkspaceConfig,
} from "@app/lib/llms/types/filter";
import type { StreamEndpointId } from "@app/lib/model_constructors/stream";

export const DUST_STREAM_ENDPOINTS = {
  [DustAnthropicClaudeHaikuFourDotFiveEuropeAgentPlatformStream.id]:
    DustAnthropicClaudeHaikuFourDotFiveEuropeAgentPlatformStream,
  [DustAnthropicClaudeOpusFourDotEightEuropeAgentPlatformStream.id]:
    DustAnthropicClaudeOpusFourDotEightEuropeAgentPlatformStream,
  [DustAnthropicClaudeOpusFourDotSevenEuropeAgentPlatformStream.id]:
    DustAnthropicClaudeOpusFourDotSevenEuropeAgentPlatformStream,
  [DustAnthropicClaudeOpusFourDotSixEuropeAgentPlatformStream.id]:
    DustAnthropicClaudeOpusFourDotSixEuropeAgentPlatformStream,
  [DustAnthropicClaudeSonnetFiveEuropeAgentPlatformStream.id]:
    DustAnthropicClaudeSonnetFiveEuropeAgentPlatformStream,
  [DustAnthropicClaudeSonnetFourDotSixEuropeAgentPlatformStream.id]:
    DustAnthropicClaudeSonnetFourDotSixEuropeAgentPlatformStream,
  [DustGoogleAiStudioGeminiThreeDotFiveFlashEuropeAgentPlatformStream.id]:
    DustGoogleAiStudioGeminiThreeDotFiveFlashEuropeAgentPlatformStream,
  [DustGoogleAiStudioGeminiThreeDotOneFlashLiteEuropeAgentPlatformStream.id]:
    DustGoogleAiStudioGeminiThreeDotOneFlashLiteEuropeAgentPlatformStream,
  [DustGoogleAiStudioGeminiThreeDotFiveFlashGlobalAgentPlatformStream.id]:
    DustGoogleAiStudioGeminiThreeDotFiveFlashGlobalAgentPlatformStream,
  [DustGoogleAiStudioGeminiThreeDotOneFlashLiteGlobalAgentPlatformStream.id]:
    DustGoogleAiStudioGeminiThreeDotOneFlashLiteGlobalAgentPlatformStream,
  [DustGoogleAiStudioGeminiThreeDotOneProGlobalAgentPlatformStream.id]:
    DustGoogleAiStudioGeminiThreeDotOneProGlobalAgentPlatformStream,
  [DustAnthropicClaudeFableFiveGlobalAnthropicStream.id]:
    DustAnthropicClaudeFableFiveGlobalAnthropicStream,
  [DustAnthropicClaudeHaikuFourDotFiveGlobalAnthropicStream.id]:
    DustAnthropicClaudeHaikuFourDotFiveGlobalAnthropicStream,
  [DustAnthropicClaudeOpusFourDotEightGlobalAnthropicStream.id]:
    DustAnthropicClaudeOpusFourDotEightGlobalAnthropicStream,
  [DustAnthropicClaudeOpusFourDotSevenGlobalAnthropicStream.id]:
    DustAnthropicClaudeOpusFourDotSevenGlobalAnthropicStream,
  [DustAnthropicClaudeOpusFourDotSixGlobalAnthropicStream.id]:
    DustAnthropicClaudeOpusFourDotSixGlobalAnthropicStream,
  [DustAnthropicClaudeSonnetFiveGlobalAnthropicStream.id]:
    DustAnthropicClaudeSonnetFiveGlobalAnthropicStream,
  [DustAnthropicClaudeSonnetFourDotSixGlobalAnthropicStream.id]:
    DustAnthropicClaudeSonnetFourDotSixGlobalAnthropicStream,
  [DustFireworksDeepSeekV4ProGlobalFireworksStream.id]:
    DustFireworksDeepSeekV4ProGlobalFireworksStream,
  [DustFireworksGlmFiveDotTwoGlobalFireworksStream.id]:
    DustFireworksGlmFiveDotTwoGlobalFireworksStream,
  [DustFireworksKimiK2Dot5GlobalFireworksStream.id]: DustFireworksKimiK2Dot5GlobalFireworksStream,
  [DustFireworksKimiK2Dot6GlobalFireworksStream.id]: DustFireworksKimiK2Dot6GlobalFireworksStream,
  [DustGoogleAiStudioGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioStream.id]:
    DustGoogleAiStudioGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioStream,
  [DustGoogleAiStudioGeminiThreeDotOneProGlobalGoogleAiStudioStream.id]:
    DustGoogleAiStudioGeminiThreeDotOneProGlobalGoogleAiStudioStream,
  [DustGoogleAiStudioGeminiThreeDotFiveFlashGlobalGoogleAiStudioStream.id]:
    DustGoogleAiStudioGeminiThreeDotFiveFlashGlobalGoogleAiStudioStream,
  [DustMistralCodestralEuropeMistralStream.id]: DustMistralCodestralEuropeMistralStream,
  [DustMistralMistralLargeEuropeMistralStream.id]: DustMistralMistralLargeEuropeMistralStream,
  [DustMistralMistralMedium35EuropeMistralStream.id]:
    DustMistralMistralMedium35EuropeMistralStream,
  [DustMistralMistralSmallEuropeMistralStream.id]: DustMistralMistralSmallEuropeMistralStream,
  [DustNoopNoopGlobalNoopStream.id]: DustNoopNoopGlobalNoopStream,
  [DustOpenAIGptFiveDotFiveEuropeOpenAIResponsesStream.id]:
    DustOpenAIGptFiveDotFiveEuropeOpenAIResponsesStream,
  [DustOpenAIGptFiveDotFourMiniEuropeOpenAIResponsesStream.id]:
    DustOpenAIGptFiveDotFourMiniEuropeOpenAIResponsesStream,
  [DustOpenAIGptFiveDotFourNanoEuropeOpenAIResponsesStream.id]:
    DustOpenAIGptFiveDotFourNanoEuropeOpenAIResponsesStream,
  [DustOpenAIGptFiveDotFourEuropeOpenAIResponsesStream.id]:
    DustOpenAIGptFiveDotFourEuropeOpenAIResponsesStream,
  [DustOpenAIGptFiveDotOneEuropeOpenAIResponsesStream.id]:
    DustOpenAIGptFiveDotOneEuropeOpenAIResponsesStream,
  [DustOpenAIGptFiveDotSixLunaEuropeOpenAIResponsesStream.id]:
    DustOpenAIGptFiveDotSixLunaEuropeOpenAIResponsesStream,
  [DustOpenAIGptFiveDotSixSolEuropeOpenAIResponsesStream.id]:
    DustOpenAIGptFiveDotSixSolEuropeOpenAIResponsesStream,
  [DustOpenAIGptFiveDotSixTerraEuropeOpenAIResponsesStream.id]:
    DustOpenAIGptFiveDotSixTerraEuropeOpenAIResponsesStream,
  [DustOpenAIGptFiveDotTwoEuropeOpenAIResponsesStream.id]:
    DustOpenAIGptFiveDotTwoEuropeOpenAIResponsesStream,
  [DustOpenAIGptFiveMiniEuropeOpenAIResponsesStream.id]:
    DustOpenAIGptFiveMiniEuropeOpenAIResponsesStream,
  [DustOpenAIGptFiveNanoEuropeOpenAIResponsesStream.id]:
    DustOpenAIGptFiveNanoEuropeOpenAIResponsesStream,
  [DustOpenAIGptFiveEuropeOpenAIResponsesStream.id]:
    DustOpenAIGptFiveEuropeOpenAIResponsesStream,
  [DustOpenAIGptFiveDotFiveGlobalOpenAIResponsesStream.id]:
    DustOpenAIGptFiveDotFiveGlobalOpenAIResponsesStream,
  [DustOpenAIGptFiveDotFourMiniGlobalOpenAIResponsesStream.id]:
    DustOpenAIGptFiveDotFourMiniGlobalOpenAIResponsesStream,
  [DustOpenAIGptFiveDotFourNanoGlobalOpenAIResponsesStream.id]:
    DustOpenAIGptFiveDotFourNanoGlobalOpenAIResponsesStream,
  [DustOpenAIGptFiveDotFourGlobalOpenAIResponsesStream.id]:
    DustOpenAIGptFiveDotFourGlobalOpenAIResponsesStream,
  [DustOpenAIGptFiveDotOneGlobalOpenAIResponsesStream.id]:
    DustOpenAIGptFiveDotOneGlobalOpenAIResponsesStream,
  [DustOpenAIGptFiveDotSixLunaGlobalOpenAIResponsesStream.id]:
    DustOpenAIGptFiveDotSixLunaGlobalOpenAIResponsesStream,
  [DustOpenAIGptFiveDotSixSolGlobalOpenAIResponsesStream.id]:
    DustOpenAIGptFiveDotSixSolGlobalOpenAIResponsesStream,
  [DustOpenAIGptFiveDotSixTerraGlobalOpenAIResponsesStream.id]:
    DustOpenAIGptFiveDotSixTerraGlobalOpenAIResponsesStream,
  [DustOpenAIGptFiveDotTwoGlobalOpenAIResponsesStream.id]:
    DustOpenAIGptFiveDotTwoGlobalOpenAIResponsesStream,
  [DustOpenAIGptFiveMiniGlobalOpenAIResponsesStream.id]:
    DustOpenAIGptFiveMiniGlobalOpenAIResponsesStream,
  [DustOpenAIGptFiveNanoGlobalOpenAIResponsesStream.id]:
    DustOpenAIGptFiveNanoGlobalOpenAIResponsesStream,
  [DustOpenAIGptFiveGlobalOpenAIResponsesStream.id]:
    DustOpenAIGptFiveGlobalOpenAIResponsesStream,
} as const satisfies Record<StreamEndpointId, DustStreamEndpointConstructor>;

export function getStreamEndpoints(
  workspaceConfiguration: WorkspaceConfig,
  inputCondition: Where<EndpointConfig>
) {
  return Object.values(DUST_STREAM_ENDPOINTS).filter((constructor) =>
    isEndpointAvailable(constructor, workspaceConfiguration, inputCondition)
  );
}
