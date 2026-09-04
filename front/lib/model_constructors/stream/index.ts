import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { AnthropicClaudeFableFiveGlobalAnthropicStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_fable_five_global_anthropic";
import { AnthropicClaudeHaikuFourDotFiveEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_haiku_four_dot_five_eu_agent_platform";
import { AnthropicClaudeHaikuFourDotFiveGlobalAnthropicStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_haiku_four_dot_five_global_anthropic";
import { AnthropicClaudeOpusFiveGlobalAnthropicStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_opus_five_global_anthropic";
import { AnthropicClaudeOpusFourDotEightEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_opus_four_dot_eight_eu_agent_platform";
import { AnthropicClaudeOpusFourDotEightGlobalAnthropicStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_opus_four_dot_eight_global_anthropic";
import { AnthropicClaudeOpusFourDotSevenEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_opus_four_dot_seven_eu_agent_platform";
import { AnthropicClaudeOpusFourDotSevenGlobalAnthropicStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_opus_four_dot_seven_global_anthropic";
import { AnthropicClaudeOpusFourDotSixEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_opus_four_dot_six_eu_agent_platform";
import { AnthropicClaudeOpusFourDotSixGlobalAnthropicStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_opus_four_dot_six_global_anthropic";
import { AnthropicClaudeSonnetFiveEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_sonnet_five_eu_agent_platform";
import { AnthropicClaudeSonnetFiveGlobalAnthropicStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_sonnet_five_global_anthropic";
import { AnthropicClaudeSonnetFourDotSixEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_sonnet_four_dot_six_eu_agent_platform";
import { AnthropicClaudeSonnetFourDotSixGlobalAnthropicStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_claude_sonnet_four_dot_six_global_anthropic";
import { DeepSeekDeepSeekV4Flash0731GlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/deepseek_deepseek_v4_flash_0731_global_fireworks";
import { DeepSeekDeepSeekV4ProGlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/deepseek_deepseek_v4_pro_global_fireworks";
import { GoogleGeminiThreeDotOneFlashLiteGlobalAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_1_flash_lite_global_agent_platform";
import { GoogleGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_1_flash_lite_global_google_ai_studio";
import { GoogleGeminiThreeDotOneProGlobalAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_1_pro_global_agent_platform";
import { GoogleGeminiThreeDotOneProGlobalGoogleAiStudioStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_1_pro_global_google_ai_studio";
import { GoogleGeminiThreeDotFiveFlashGlobalAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_5_flash_global_agent_platform";
import { GoogleGeminiThreeDotFiveFlashGlobalGoogleAiStudioStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_5_flash_global_google_ai_studio";
import { GoogleGeminiThreeDotFiveFlashLiteGlobalAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_5_flash_lite_global_agent_platform";
import { GoogleGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_5_flash_lite_global_google_ai_studio";
import { GoogleGeminiThreeDotSixFlashGlobalAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_6_flash_global_agent_platform";
import { GoogleGeminiThreeDotSixFlashGlobalGoogleAiStudioStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_6_flash_global_google_ai_studio";
import { GoogleGeminiThreeDotSevenFlashGlobalAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_7_flash_global_agent_platform";
import { GoogleGeminiThreeDotSevenFlashGlobalGoogleAiStudioStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_7_flash_global_google_ai_studio";
import { GoogleGeminiThreeDotEightFlashGlobalAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_8_flash_global_agent_platform";
import { GoogleGeminiThreeDotEightFlashGlobalGoogleAiStudioStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_8_flash_global_google_ai_studio";
import { MistralCodestralEuropeMistralStream } from "@app/lib/model_constructors/stream/endpoints/mistral_codestral_eu_mistral";
import { MistralMistralLargeEuropeMistralStream } from "@app/lib/model_constructors/stream/endpoints/mistral_mistral_large_eu_mistral";
import { MistralMistralMedium35EuropeMistralStream } from "@app/lib/model_constructors/stream/endpoints/mistral_mistral_medium_3_5_eu_mistral";
import { MistralMistralSmallEuropeMistralStream } from "@app/lib/model_constructors/stream/endpoints/mistral_mistral_small_eu_mistral";
import { MoonshotAiKimiK2Dot6GlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/moonshot_ai_kimi_k2_dot_six_global_fireworks";
import { MoonshotAiKimiK3GlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/moonshot_ai_kimi_k3_global_fireworks";
import { NoopNoopGlobalNoopStream } from "@app/lib/model_constructors/stream/endpoints/noop_noop_global_noop";
import { OpenAIGptFiveDotFiveEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_five_eu_openai_responses";
import { OpenAIGptFiveDotFiveGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_five_global_openai_responses";
import { OpenAIGptFiveDotFourEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_four_eu_openai_responses";
import { OpenAIGptFiveDotFourGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_four_global_openai_responses";
import { OpenAIGptFiveDotFourMiniEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_four_mini_eu_openai_responses";
import { OpenAIGptFiveDotFourMiniGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_four_mini_global_openai_responses";
import { OpenAIGptFiveDotFourNanoEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_four_nano_eu_openai_responses";
import { OpenAIGptFiveDotFourNanoGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_four_nano_global_openai_responses";
import { OpenAIGptFiveDotOneEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_one_eu_openai_responses";
import { OpenAIGptFiveDotOneGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_one_global_openai_responses";
import { OpenAIGptFiveDotSixLunaEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_luna_eu_openai_responses";
import { OpenAIGptFiveDotSixLunaGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_luna_global_openai_responses";
import { OpenAIGptFiveDotSixSolEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_sol_eu_openai_responses";
import { OpenAIGptFiveDotSixSolGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_sol_global_openai_responses";
import { OpenAIGptFiveDotSixTerraEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_terra_eu_openai_responses";
import { OpenAIGptFiveDotSixTerraGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_terra_global_openai_responses";
import { OpenAIGptFiveDotSixTerraLongContextEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_terra_long_context_eu_openai_responses";
import { OpenAIGptFiveDotSixTerraLongContextGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_terra_long_context_global_openai_responses";
import { OpenAIGptFiveDotTwoEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_two_eu_openai_responses";
import { OpenAIGptFiveDotTwoGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_two_global_openai_responses";
import { OpenAIGptFiveEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_eu_openai_responses";
import { OpenAIGptFiveGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_global_openai_responses";
import { OpenAIGptFiveMiniEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_mini_eu_openai_responses";
import { OpenAIGptFiveMiniGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_mini_global_openai_responses";
import { OpenAIGptFiveNanoEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_nano_eu_openai_responses";
import { OpenAIGptFiveNanoGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_nano_global_openai_responses";
import { ThinkingMachinesInklingGlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/thinking_machines_inkling_global_fireworks";
import { XaiGrokFourDotFiveGlobalXaiStream } from "@app/lib/model_constructors/stream/endpoints/xai_grok_four_dot_five_global_xai";
import { XaiGrokFourDotSixGlobalXaiStream } from "@app/lib/model_constructors/stream/endpoints/xai_grok_four_dot_six_global_xai";
import { ZAiGlmFiveDotThreeFlashGlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/z_ai_glm_five_dot_three_flash_global_fireworks";
import { ZAiGlmFiveDotTwoGlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/z_ai_glm_five_dot_two_global_fireworks";

export const STREAM_ENDPOINTS = {
  [AnthropicClaudeHaikuFourDotFiveEuropeAgentPlatformStream.id]:
    AnthropicClaudeHaikuFourDotFiveEuropeAgentPlatformStream,
  [AnthropicClaudeOpusFourDotEightEuropeAgentPlatformStream.id]:
    AnthropicClaudeOpusFourDotEightEuropeAgentPlatformStream,
  [AnthropicClaudeOpusFourDotSevenEuropeAgentPlatformStream.id]:
    AnthropicClaudeOpusFourDotSevenEuropeAgentPlatformStream,
  [AnthropicClaudeOpusFourDotSixEuropeAgentPlatformStream.id]:
    AnthropicClaudeOpusFourDotSixEuropeAgentPlatformStream,
  [AnthropicClaudeSonnetFiveEuropeAgentPlatformStream.id]:
    AnthropicClaudeSonnetFiveEuropeAgentPlatformStream,
  [AnthropicClaudeSonnetFourDotSixEuropeAgentPlatformStream.id]:
    AnthropicClaudeSonnetFourDotSixEuropeAgentPlatformStream,
  [GoogleGeminiThreeDotFiveFlashGlobalAgentPlatformStream.id]:
    GoogleGeminiThreeDotFiveFlashGlobalAgentPlatformStream,
  [GoogleGeminiThreeDotSixFlashGlobalAgentPlatformStream.id]:
    GoogleGeminiThreeDotSixFlashGlobalAgentPlatformStream,
  [GoogleGeminiThreeDotSevenFlashGlobalAgentPlatformStream.id]:
    GoogleGeminiThreeDotSevenFlashGlobalAgentPlatformStream,
  [GoogleGeminiThreeDotEightFlashGlobalAgentPlatformStream.id]:
    GoogleGeminiThreeDotEightFlashGlobalAgentPlatformStream,
  [GoogleGeminiThreeDotOneFlashLiteGlobalAgentPlatformStream.id]:
    GoogleGeminiThreeDotOneFlashLiteGlobalAgentPlatformStream,
  [GoogleGeminiThreeDotFiveFlashLiteGlobalAgentPlatformStream.id]:
    GoogleGeminiThreeDotFiveFlashLiteGlobalAgentPlatformStream,
  [GoogleGeminiThreeDotOneProGlobalAgentPlatformStream.id]:
    GoogleGeminiThreeDotOneProGlobalAgentPlatformStream,
  [AnthropicClaudeFableFiveGlobalAnthropicStream.id]:
    AnthropicClaudeFableFiveGlobalAnthropicStream,
  [AnthropicClaudeHaikuFourDotFiveGlobalAnthropicStream.id]:
    AnthropicClaudeHaikuFourDotFiveGlobalAnthropicStream,
  [AnthropicClaudeOpusFiveGlobalAnthropicStream.id]:
    AnthropicClaudeOpusFiveGlobalAnthropicStream,
  [AnthropicClaudeOpusFourDotEightGlobalAnthropicStream.id]:
    AnthropicClaudeOpusFourDotEightGlobalAnthropicStream,
  [AnthropicClaudeOpusFourDotSevenGlobalAnthropicStream.id]:
    AnthropicClaudeOpusFourDotSevenGlobalAnthropicStream,
  [AnthropicClaudeOpusFourDotSixGlobalAnthropicStream.id]:
    AnthropicClaudeOpusFourDotSixGlobalAnthropicStream,
  [AnthropicClaudeSonnetFiveGlobalAnthropicStream.id]:
    AnthropicClaudeSonnetFiveGlobalAnthropicStream,
  [AnthropicClaudeSonnetFourDotSixGlobalAnthropicStream.id]:
    AnthropicClaudeSonnetFourDotSixGlobalAnthropicStream,
  [DeepSeekDeepSeekV4ProGlobalFireworksStream.id]:
    DeepSeekDeepSeekV4ProGlobalFireworksStream,
  [DeepSeekDeepSeekV4Flash0731GlobalFireworksStream.id]:
    DeepSeekDeepSeekV4Flash0731GlobalFireworksStream,
  [ZAiGlmFiveDotTwoGlobalFireworksStream.id]:
    ZAiGlmFiveDotTwoGlobalFireworksStream,
  [ZAiGlmFiveDotThreeFlashGlobalFireworksStream.id]:
    ZAiGlmFiveDotThreeFlashGlobalFireworksStream,
  [MoonshotAiKimiK2Dot6GlobalFireworksStream.id]:
    MoonshotAiKimiK2Dot6GlobalFireworksStream,
  [MoonshotAiKimiK3GlobalFireworksStream.id]:
    MoonshotAiKimiK3GlobalFireworksStream,
  [ThinkingMachinesInklingGlobalFireworksStream.id]:
    ThinkingMachinesInklingGlobalFireworksStream,
  [GoogleGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioStream.id]:
    GoogleGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioStream,
  [GoogleGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioStream.id]:
    GoogleGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioStream,
  [GoogleGeminiThreeDotOneProGlobalGoogleAiStudioStream.id]:
    GoogleGeminiThreeDotOneProGlobalGoogleAiStudioStream,
  [GoogleGeminiThreeDotFiveFlashGlobalGoogleAiStudioStream.id]:
    GoogleGeminiThreeDotFiveFlashGlobalGoogleAiStudioStream,
  [GoogleGeminiThreeDotSixFlashGlobalGoogleAiStudioStream.id]:
    GoogleGeminiThreeDotSixFlashGlobalGoogleAiStudioStream,
  [GoogleGeminiThreeDotSevenFlashGlobalGoogleAiStudioStream.id]:
    GoogleGeminiThreeDotSevenFlashGlobalGoogleAiStudioStream,
  [GoogleGeminiThreeDotEightFlashGlobalGoogleAiStudioStream.id]:
    GoogleGeminiThreeDotEightFlashGlobalGoogleAiStudioStream,
  [MistralCodestralEuropeMistralStream.id]: MistralCodestralEuropeMistralStream,
  [MistralMistralLargeEuropeMistralStream.id]:
    MistralMistralLargeEuropeMistralStream,
  [MistralMistralMedium35EuropeMistralStream.id]:
    MistralMistralMedium35EuropeMistralStream,
  [MistralMistralSmallEuropeMistralStream.id]:
    MistralMistralSmallEuropeMistralStream,
  [NoopNoopGlobalNoopStream.id]: NoopNoopGlobalNoopStream,
  [OpenAIGptFiveDotFiveEuropeOpenAIResponsesStream.id]:
    OpenAIGptFiveDotFiveEuropeOpenAIResponsesStream,
  [OpenAIGptFiveDotFourMiniEuropeOpenAIResponsesStream.id]:
    OpenAIGptFiveDotFourMiniEuropeOpenAIResponsesStream,
  [OpenAIGptFiveDotFourNanoEuropeOpenAIResponsesStream.id]:
    OpenAIGptFiveDotFourNanoEuropeOpenAIResponsesStream,
  [OpenAIGptFiveDotFourEuropeOpenAIResponsesStream.id]:
    OpenAIGptFiveDotFourEuropeOpenAIResponsesStream,
  [OpenAIGptFiveDotOneEuropeOpenAIResponsesStream.id]:
    OpenAIGptFiveDotOneEuropeOpenAIResponsesStream,
  [OpenAIGptFiveDotSixLunaEuropeOpenAIResponsesStream.id]:
    OpenAIGptFiveDotSixLunaEuropeOpenAIResponsesStream,
  [OpenAIGptFiveDotSixSolEuropeOpenAIResponsesStream.id]:
    OpenAIGptFiveDotSixSolEuropeOpenAIResponsesStream,
  [OpenAIGptFiveDotSixTerraEuropeOpenAIResponsesStream.id]:
    OpenAIGptFiveDotSixTerraEuropeOpenAIResponsesStream,
  [OpenAIGptFiveDotSixTerraLongContextEuropeOpenAIResponsesStream.id]:
    OpenAIGptFiveDotSixTerraLongContextEuropeOpenAIResponsesStream,
  [OpenAIGptFiveDotTwoEuropeOpenAIResponsesStream.id]:
    OpenAIGptFiveDotTwoEuropeOpenAIResponsesStream,
  [OpenAIGptFiveMiniEuropeOpenAIResponsesStream.id]:
    OpenAIGptFiveMiniEuropeOpenAIResponsesStream,
  [OpenAIGptFiveNanoEuropeOpenAIResponsesStream.id]:
    OpenAIGptFiveNanoEuropeOpenAIResponsesStream,
  [OpenAIGptFiveEuropeOpenAIResponsesStream.id]:
    OpenAIGptFiveEuropeOpenAIResponsesStream,
  [OpenAIGptFiveDotFiveGlobalOpenAIResponsesStream.id]:
    OpenAIGptFiveDotFiveGlobalOpenAIResponsesStream,
  [OpenAIGptFiveDotFourMiniGlobalOpenAIResponsesStream.id]:
    OpenAIGptFiveDotFourMiniGlobalOpenAIResponsesStream,
  [OpenAIGptFiveDotFourNanoGlobalOpenAIResponsesStream.id]:
    OpenAIGptFiveDotFourNanoGlobalOpenAIResponsesStream,
  [OpenAIGptFiveDotFourGlobalOpenAIResponsesStream.id]:
    OpenAIGptFiveDotFourGlobalOpenAIResponsesStream,
  [OpenAIGptFiveDotOneGlobalOpenAIResponsesStream.id]:
    OpenAIGptFiveDotOneGlobalOpenAIResponsesStream,
  [OpenAIGptFiveDotSixLunaGlobalOpenAIResponsesStream.id]:
    OpenAIGptFiveDotSixLunaGlobalOpenAIResponsesStream,
  [OpenAIGptFiveDotSixSolGlobalOpenAIResponsesStream.id]:
    OpenAIGptFiveDotSixSolGlobalOpenAIResponsesStream,
  [OpenAIGptFiveDotSixTerraGlobalOpenAIResponsesStream.id]:
    OpenAIGptFiveDotSixTerraGlobalOpenAIResponsesStream,
  [OpenAIGptFiveDotSixTerraLongContextGlobalOpenAIResponsesStream.id]:
    OpenAIGptFiveDotSixTerraLongContextGlobalOpenAIResponsesStream,
  [OpenAIGptFiveDotTwoGlobalOpenAIResponsesStream.id]:
    OpenAIGptFiveDotTwoGlobalOpenAIResponsesStream,
  [OpenAIGptFiveMiniGlobalOpenAIResponsesStream.id]:
    OpenAIGptFiveMiniGlobalOpenAIResponsesStream,
  [OpenAIGptFiveNanoGlobalOpenAIResponsesStream.id]:
    OpenAIGptFiveNanoGlobalOpenAIResponsesStream,
  [OpenAIGptFiveGlobalOpenAIResponsesStream.id]:
    OpenAIGptFiveGlobalOpenAIResponsesStream,
  [XaiGrokFourDotFiveGlobalXaiStream.id]: XaiGrokFourDotFiveGlobalXaiStream,
  [XaiGrokFourDotSixGlobalXaiStream.id]: XaiGrokFourDotSixGlobalXaiStream,
} as const satisfies Record<string, StreamEndpointConstructor>;

export type StreamEndpointId = keyof typeof STREAM_ENDPOINTS;
