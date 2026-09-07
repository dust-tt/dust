import type { DustStreamEndpointConstructor } from "@app/lib/llms/stream/dust_stream_endpoint";
import { DustAnthropicClaudeFableFiveGlobalAnthropicStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_fable_five_global_anthropic";
import { DustAnthropicClaudeHaikuFourDotFiveEuropeAgentPlatformStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_haiku_four_dot_five_eu_agent_platform";
import { DustAnthropicClaudeHaikuFourDotFiveGlobalAnthropicStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_haiku_four_dot_five_global_anthropic";
import { DustAnthropicClaudeOpusFiveGlobalAnthropicStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_opus_five_global_anthropic";
import { DustAnthropicClaudeOpusFourDotEightEuropeAgentPlatformStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_opus_four_dot_eight_eu_agent_platform";
import { DustAnthropicClaudeOpusFourDotEightGlobalAnthropicStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_opus_four_dot_eight_global_anthropic";
import { DustAnthropicClaudeOpusFourDotSevenEuropeAgentPlatformStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_opus_four_dot_seven_eu_agent_platform";
import { DustAnthropicClaudeOpusFourDotSevenGlobalAnthropicStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_opus_four_dot_seven_global_anthropic";
import { DustAnthropicClaudeOpusFourDotSixEuropeAgentPlatformStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_opus_four_dot_six_eu_agent_platform";
import { DustAnthropicClaudeOpusFourDotSixGlobalAnthropicStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_opus_four_dot_six_global_anthropic";
import { DustAnthropicClaudeSonnetFiveEuropeAgentPlatformStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_sonnet_five_eu_agent_platform";
import { DustAnthropicClaudeSonnetFiveGlobalAnthropicStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_sonnet_five_global_anthropic";
import { DustAnthropicClaudeSonnetFourDotSixEuropeAgentPlatformStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_sonnet_four_dot_six_eu_agent_platform";
import { DustAnthropicClaudeSonnetFourDotSixGlobalAnthropicStream } from "@app/lib/llms/stream/endpoints/anthropic_claude_sonnet_four_dot_six_global_anthropic";
import { DustDeepSeekDeepSeekV4Flash0731GlobalFireworksStream } from "@app/lib/llms/stream/endpoints/deepseek_deepseek_v4_flash_0731_global_fireworks";
import { DustDeepSeekDeepSeekV4ProGlobalFireworksStream } from "@app/lib/llms/stream/endpoints/deepseek_deepseek_v4_pro_global_fireworks";
import { DustGoogleGeminiThreeDotOneFlashLiteGlobalAgentPlatformStream } from "@app/lib/llms/stream/endpoints/google_gemini_3_1_flash_lite_global_agent_platform";
import { DustGoogleGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioStream } from "@app/lib/llms/stream/endpoints/google_gemini_3_1_flash_lite_global_google_ai_studio";
import { DustGoogleGeminiThreeDotOneProGlobalAgentPlatformStream } from "@app/lib/llms/stream/endpoints/google_gemini_3_1_pro_global_agent_platform";
import { DustGoogleGeminiThreeDotOneProGlobalGoogleAiStudioStream } from "@app/lib/llms/stream/endpoints/google_gemini_3_1_pro_global_google_ai_studio";
import { DustGoogleGeminiThreeDotFiveFlashGlobalAgentPlatformStream } from "@app/lib/llms/stream/endpoints/google_gemini_3_5_flash_global_agent_platform";
import { DustGoogleGeminiThreeDotFiveFlashGlobalGoogleAiStudioStream } from "@app/lib/llms/stream/endpoints/google_gemini_3_5_flash_global_google_ai_studio";
import { DustGoogleGeminiThreeDotFiveFlashLiteGlobalAgentPlatformStream } from "@app/lib/llms/stream/endpoints/google_gemini_3_5_flash_lite_global_agent_platform";
import { DustGoogleGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioStream } from "@app/lib/llms/stream/endpoints/google_gemini_3_5_flash_lite_global_google_ai_studio";
import { DustGoogleGeminiThreeDotSixFlashEuropeAgentPlatformStream } from "@app/lib/llms/stream/endpoints/google_gemini_3_6_flash_eu_agent_platform";
import { DustGoogleGeminiThreeDotSixFlashGlobalAgentPlatformStream } from "@app/lib/llms/stream/endpoints/google_gemini_3_6_flash_global_agent_platform";
import { DustGoogleGeminiThreeDotSixFlashGlobalGoogleAiStudioStream } from "@app/lib/llms/stream/endpoints/google_gemini_3_6_flash_global_google_ai_studio";
import { DustGoogleGeminiThreeDotSevenFlashEuropeAgentPlatformStream } from "@app/lib/llms/stream/endpoints/google_gemini_3_7_flash_eu_agent_platform";
import { DustGoogleGeminiThreeDotSevenFlashGlobalAgentPlatformStream } from "@app/lib/llms/stream/endpoints/google_gemini_3_7_flash_global_agent_platform";
import { DustGoogleGeminiThreeDotSevenFlashGlobalGoogleAiStudioStream } from "@app/lib/llms/stream/endpoints/google_gemini_3_7_flash_global_google_ai_studio";
import { DustGoogleGeminiThreeDotEightFlashEuropeAgentPlatformStream } from "@app/lib/llms/stream/endpoints/google_gemini_3_8_flash_eu_agent_platform";
import { DustGoogleGeminiThreeDotEightFlashGlobalAgentPlatformStream } from "@app/lib/llms/stream/endpoints/google_gemini_3_8_flash_global_agent_platform";
import { DustGoogleGeminiThreeDotEightFlashGlobalGoogleAiStudioStream } from "@app/lib/llms/stream/endpoints/google_gemini_3_8_flash_global_google_ai_studio";
import { DustMistralCodestralEuropeMistralStream } from "@app/lib/llms/stream/endpoints/mistral_codestral_eu_mistral";
import { DustMistralMistralLargeEuropeMistralStream } from "@app/lib/llms/stream/endpoints/mistral_mistral_large_eu_mistral";
import { DustMistralMistralMedium35EuropeMistralStream } from "@app/lib/llms/stream/endpoints/mistral_mistral_medium_3_5_eu_mistral";
import { DustMistralMistralSmallEuropeMistralStream } from "@app/lib/llms/stream/endpoints/mistral_mistral_small_eu_mistral";
import { DustMoonshotAiKimiK2Dot6GlobalFireworksStream } from "@app/lib/llms/stream/endpoints/moonshot_ai_kimi_k2_dot_six_global_fireworks";
import { DustMoonshotAiKimiK3GlobalFireworksStream } from "@app/lib/llms/stream/endpoints/moonshot_ai_kimi_k3_global_fireworks";
import { DustNoopNoopGlobalNoopStream } from "@app/lib/llms/stream/endpoints/noop_noop_global_noop";
import { DustOpenAIGptFiveDotFiveEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_five_eu_openai_responses";
import { DustOpenAIGptFiveDotFiveGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_five_global_openai_responses";
import { DustOpenAIGptFiveDotFourEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_four_eu_openai_responses";
import { DustOpenAIGptFiveDotFourGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_four_global_openai_responses";
import { DustOpenAIGptFiveDotFourMiniEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_four_mini_eu_openai_responses";
import { DustOpenAIGptFiveDotFourMiniGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_four_mini_global_openai_responses";
import { DustOpenAIGptFiveDotFourNanoEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_four_nano_eu_openai_responses";
import { DustOpenAIGptFiveDotFourNanoGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_four_nano_global_openai_responses";
import { DustOpenAIGptFiveDotOneEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_one_eu_openai_responses";
import { DustOpenAIGptFiveDotOneGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_one_global_openai_responses";
import { DustOpenAIGptFiveDotSixLunaEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_six_luna_eu_openai_responses";
import { DustOpenAIGptFiveDotSixLunaGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_six_luna_global_openai_responses";
import { DustOpenAIGptFiveDotSixSolEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_six_sol_eu_openai_responses";
import { DustOpenAIGptFiveDotSixSolGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_six_sol_global_openai_responses";
import { DustOpenAIGptFiveDotSixTerraEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_six_terra_eu_openai_responses";
import { DustOpenAIGptFiveDotSixTerraGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_six_terra_global_openai_responses";
import { DustOpenAIGptFiveDotSixTerraLongContextEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_six_terra_long_context_eu_openai_responses";
import { DustOpenAIGptFiveDotSixTerraLongContextGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_six_terra_long_context_global_openai_responses";
import { DustOpenAIGptFiveDotTwoEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_two_eu_openai_responses";
import { DustOpenAIGptFiveDotTwoGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_dot_two_global_openai_responses";
import { DustOpenAIGptFiveEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_eu_openai_responses";
import { DustOpenAIGptFiveGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_global_openai_responses";
import { DustOpenAIGptFiveMiniEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_mini_eu_openai_responses";
import { DustOpenAIGptFiveMiniGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_mini_global_openai_responses";
import { DustOpenAIGptFiveNanoEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_nano_eu_openai_responses";
import { DustOpenAIGptFiveNanoGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_five_nano_global_openai_responses";
import { DustOpenAIGptSixAstraEuropeOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_six_astra_eu_openai_responses";
import { DustOpenAIGptSixAstraGlobalOpenAIResponsesStream } from "@app/lib/llms/stream/endpoints/openai_gpt_six_astra_global_openai_responses";
import { DustThinkingMachinesInklingGlobalFireworksStream } from "@app/lib/llms/stream/endpoints/thinking_machines_inkling_global_fireworks";
import { DustXaiGrokFourDotFiveGlobalXaiStream } from "@app/lib/llms/stream/endpoints/xai_grok_four_dot_five_global_xai";
import { DustXaiGrokFourDotSixGlobalXaiStream } from "@app/lib/llms/stream/endpoints/xai_grok_four_dot_six_global_xai";
import { DustZAiGlmFiveDotThreeFlashGlobalFireworksStream } from "@app/lib/llms/stream/endpoints/z_ai_glm_five_dot_three_flash_global_fireworks";
import { DustZAiGlmFiveDotTwoGlobalFireworksStream } from "@app/lib/llms/stream/endpoints/z_ai_glm_five_dot_two_global_fireworks";
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
  [DustGoogleGeminiThreeDotFiveFlashGlobalAgentPlatformStream.id]:
    DustGoogleGeminiThreeDotFiveFlashGlobalAgentPlatformStream,
  [DustGoogleGeminiThreeDotSixFlashEuropeAgentPlatformStream.id]:
    DustGoogleGeminiThreeDotSixFlashEuropeAgentPlatformStream,
  [DustGoogleGeminiThreeDotSixFlashGlobalAgentPlatformStream.id]:
    DustGoogleGeminiThreeDotSixFlashGlobalAgentPlatformStream,
  [DustGoogleGeminiThreeDotSevenFlashEuropeAgentPlatformStream.id]:
    DustGoogleGeminiThreeDotSevenFlashEuropeAgentPlatformStream,
  [DustGoogleGeminiThreeDotSevenFlashGlobalAgentPlatformStream.id]:
    DustGoogleGeminiThreeDotSevenFlashGlobalAgentPlatformStream,
  [DustGoogleGeminiThreeDotEightFlashEuropeAgentPlatformStream.id]:
    DustGoogleGeminiThreeDotEightFlashEuropeAgentPlatformStream,
  [DustGoogleGeminiThreeDotEightFlashGlobalAgentPlatformStream.id]:
    DustGoogleGeminiThreeDotEightFlashGlobalAgentPlatformStream,
  [DustGoogleGeminiThreeDotOneFlashLiteGlobalAgentPlatformStream.id]:
    DustGoogleGeminiThreeDotOneFlashLiteGlobalAgentPlatformStream,
  [DustGoogleGeminiThreeDotFiveFlashLiteGlobalAgentPlatformStream.id]:
    DustGoogleGeminiThreeDotFiveFlashLiteGlobalAgentPlatformStream,
  [DustGoogleGeminiThreeDotOneProGlobalAgentPlatformStream.id]:
    DustGoogleGeminiThreeDotOneProGlobalAgentPlatformStream,
  [DustAnthropicClaudeFableFiveGlobalAnthropicStream.id]:
    DustAnthropicClaudeFableFiveGlobalAnthropicStream,
  [DustAnthropicClaudeHaikuFourDotFiveGlobalAnthropicStream.id]:
    DustAnthropicClaudeHaikuFourDotFiveGlobalAnthropicStream,
  [DustAnthropicClaudeOpusFiveGlobalAnthropicStream.id]:
    DustAnthropicClaudeOpusFiveGlobalAnthropicStream,
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

  [DustDeepSeekDeepSeekV4ProGlobalFireworksStream.id]:
    DustDeepSeekDeepSeekV4ProGlobalFireworksStream,

  [DustDeepSeekDeepSeekV4Flash0731GlobalFireworksStream.id]:
    DustDeepSeekDeepSeekV4Flash0731GlobalFireworksStream,

  [DustZAiGlmFiveDotTwoGlobalFireworksStream.id]:
    DustZAiGlmFiveDotTwoGlobalFireworksStream,
  [DustZAiGlmFiveDotThreeFlashGlobalFireworksStream.id]:
    DustZAiGlmFiveDotThreeFlashGlobalFireworksStream,

  [DustMoonshotAiKimiK2Dot6GlobalFireworksStream.id]:
    DustMoonshotAiKimiK2Dot6GlobalFireworksStream,
  [DustMoonshotAiKimiK3GlobalFireworksStream.id]:
    DustMoonshotAiKimiK3GlobalFireworksStream,

  [DustThinkingMachinesInklingGlobalFireworksStream.id]:
    DustThinkingMachinesInklingGlobalFireworksStream,

  [DustGoogleGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioStream.id]:
    DustGoogleGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioStream,
  [DustGoogleGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioStream.id]:
    DustGoogleGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioStream,
  [DustGoogleGeminiThreeDotOneProGlobalGoogleAiStudioStream.id]:
    DustGoogleGeminiThreeDotOneProGlobalGoogleAiStudioStream,
  [DustGoogleGeminiThreeDotFiveFlashGlobalGoogleAiStudioStream.id]:
    DustGoogleGeminiThreeDotFiveFlashGlobalGoogleAiStudioStream,
  [DustGoogleGeminiThreeDotSixFlashGlobalGoogleAiStudioStream.id]:
    DustGoogleGeminiThreeDotSixFlashGlobalGoogleAiStudioStream,
  [DustGoogleGeminiThreeDotSevenFlashGlobalGoogleAiStudioStream.id]:
    DustGoogleGeminiThreeDotSevenFlashGlobalGoogleAiStudioStream,
  [DustGoogleGeminiThreeDotEightFlashGlobalGoogleAiStudioStream.id]:
    DustGoogleGeminiThreeDotEightFlashGlobalGoogleAiStudioStream,

  [DustMistralCodestralEuropeMistralStream.id]:
    DustMistralCodestralEuropeMistralStream,
  [DustMistralMistralLargeEuropeMistralStream.id]:
    DustMistralMistralLargeEuropeMistralStream,
  [DustMistralMistralMedium35EuropeMistralStream.id]:
    DustMistralMistralMedium35EuropeMistralStream,
  [DustMistralMistralSmallEuropeMistralStream.id]:
    DustMistralMistralSmallEuropeMistralStream,

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
  [DustOpenAIGptSixAstraEuropeOpenAIResponsesStream.id]:
    DustOpenAIGptSixAstraEuropeOpenAIResponsesStream,
  [DustOpenAIGptFiveDotSixSolEuropeOpenAIResponsesStream.id]:
    DustOpenAIGptFiveDotSixSolEuropeOpenAIResponsesStream,
  [DustOpenAIGptFiveDotSixTerraEuropeOpenAIResponsesStream.id]:
    DustOpenAIGptFiveDotSixTerraEuropeOpenAIResponsesStream,
  [DustOpenAIGptFiveDotSixTerraLongContextEuropeOpenAIResponsesStream.id]:
    DustOpenAIGptFiveDotSixTerraLongContextEuropeOpenAIResponsesStream,
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
  [DustOpenAIGptSixAstraGlobalOpenAIResponsesStream.id]:
    DustOpenAIGptSixAstraGlobalOpenAIResponsesStream,
  [DustOpenAIGptFiveDotSixSolGlobalOpenAIResponsesStream.id]:
    DustOpenAIGptFiveDotSixSolGlobalOpenAIResponsesStream,
  [DustOpenAIGptFiveDotSixTerraGlobalOpenAIResponsesStream.id]:
    DustOpenAIGptFiveDotSixTerraGlobalOpenAIResponsesStream,
  [DustOpenAIGptFiveDotSixTerraLongContextGlobalOpenAIResponsesStream.id]:
    DustOpenAIGptFiveDotSixTerraLongContextGlobalOpenAIResponsesStream,
  [DustOpenAIGptFiveDotTwoGlobalOpenAIResponsesStream.id]:
    DustOpenAIGptFiveDotTwoGlobalOpenAIResponsesStream,
  [DustOpenAIGptFiveMiniGlobalOpenAIResponsesStream.id]:
    DustOpenAIGptFiveMiniGlobalOpenAIResponsesStream,
  [DustOpenAIGptFiveNanoGlobalOpenAIResponsesStream.id]:
    DustOpenAIGptFiveNanoGlobalOpenAIResponsesStream,
  [DustOpenAIGptFiveGlobalOpenAIResponsesStream.id]:
    DustOpenAIGptFiveGlobalOpenAIResponsesStream,
  [DustXaiGrokFourDotFiveGlobalXaiStream.id]:
    DustXaiGrokFourDotFiveGlobalXaiStream,
  [DustXaiGrokFourDotSixGlobalXaiStream.id]:
    DustXaiGrokFourDotSixGlobalXaiStream,
} as const satisfies Record<StreamEndpointId, DustStreamEndpointConstructor>;

export function getStreamEndpoints(
  workspaceConfiguration: WorkspaceConfig,
  inputCondition: Where<EndpointConfig>
) {
  return Object.values(DUST_STREAM_ENDPOINTS).filter((constructor) =>
    isEndpointAvailable(constructor, workspaceConfiguration, inputCondition)
  );
}
