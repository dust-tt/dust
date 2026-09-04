// Completeness map: every stream endpoint must have a corresponding test
// setup here. The `satisfies Record<StreamEndpointId, StreamSetup>` fails to
// type-check when a new endpoint is added to `STREAM_ENDPOINTS` without a
// matching test file exporting its `setup`, forcing the test to be written.
import type { StreamEndpointId } from "@app/lib/model_constructors/stream";
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
import { GoogleGeminiThreeDotEightFlashEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_8_flash_eu_agent_platform";
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
import { AnthropicClaudeFableFiveGlobalAnthropicStreamSetup } from "@app/lib/model_constructors/test/endpoints/anthropic_claude_fable_five_global_anthropic.test";
import { AnthropicClaudeHaikuFourDotFiveEuropeAgentPlatformStreamSetup } from "@app/lib/model_constructors/test/endpoints/anthropic_claude_haiku_four_dot_five_eu_agent_platform.test";
import { AnthropicClaudeHaikuFourDotFiveGlobalAnthropicStreamSetup } from "@app/lib/model_constructors/test/endpoints/anthropic_claude_haiku_four_dot_five_global_anthropic.test";
import { AnthropicClaudeOpusFiveGlobalAnthropicStreamSetup } from "@app/lib/model_constructors/test/endpoints/anthropic_claude_opus_five_global_anthropic.test";
import { AnthropicClaudeOpusFourDotEightEuropeAgentPlatformStreamSetup } from "@app/lib/model_constructors/test/endpoints/anthropic_claude_opus_four_dot_eight_eu_agent_platform.test";
import { AnthropicClaudeOpusFourDotEightGlobalAnthropicStreamSetup } from "@app/lib/model_constructors/test/endpoints/anthropic_claude_opus_four_dot_eight_global_anthropic.test";
import { AnthropicClaudeOpusFourDotSevenEuropeAgentPlatformStreamSetup } from "@app/lib/model_constructors/test/endpoints/anthropic_claude_opus_four_dot_seven_eu_agent_platform.test";
import { AnthropicClaudeOpusFourDotSevenGlobalAnthropicStreamSetup } from "@app/lib/model_constructors/test/endpoints/anthropic_claude_opus_four_dot_seven_global_anthropic.test";
import { AnthropicClaudeOpusFourDotSixEuropeAgentPlatformStreamSetup } from "@app/lib/model_constructors/test/endpoints/anthropic_claude_opus_four_dot_six_eu_agent_platform.test";
import { AnthropicClaudeOpusFourDotSixGlobalAnthropicStreamSetup } from "@app/lib/model_constructors/test/endpoints/anthropic_claude_opus_four_dot_six_global_anthropic.test";
import { AnthropicClaudeSonnetFiveEuropeAgentPlatformStreamSetup } from "@app/lib/model_constructors/test/endpoints/anthropic_claude_sonnet_five_eu_agent_platform.test";
import { AnthropicClaudeSonnetFiveGlobalAnthropicStreamSetup } from "@app/lib/model_constructors/test/endpoints/anthropic_claude_sonnet_five_global_anthropic.test";
import { AnthropicClaudeSonnetFourDotSixEuropeAgentPlatformStreamSetup } from "@app/lib/model_constructors/test/endpoints/anthropic_claude_sonnet_four_dot_six_eu_agent_platform.test";
import { AnthropicClaudeSonnetFourDotSixGlobalAnthropicStreamSetup } from "@app/lib/model_constructors/test/endpoints/anthropic_claude_sonnet_four_dot_six_global_anthropic.test";
import { DeepSeekDeepSeekV4Flash0731GlobalFireworksStreamSetup } from "@app/lib/model_constructors/test/endpoints/deepseek_deepseek_v4_flash_0731_global_fireworks.test";
import { DeepSeekDeepSeekV4ProGlobalFireworksStreamSetup } from "@app/lib/model_constructors/test/endpoints/deepseek_deepseek_v4_pro_global_fireworks.test";
import { GoogleGeminiThreeDotOneFlashLiteGlobalAgentPlatformStreamSetup } from "@app/lib/model_constructors/test/endpoints/google_gemini_3_1_flash_lite_global_agent_platform.test";
import { GoogleGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioStreamSetup } from "@app/lib/model_constructors/test/endpoints/google_gemini_3_1_flash_lite_global_google_ai_studio.test";
import { GoogleGeminiThreeDotOneProGlobalAgentPlatformStreamSetup } from "@app/lib/model_constructors/test/endpoints/google_gemini_3_1_pro_global_agent_platform.test";
import { GoogleGeminiThreeDotOneProGlobalGoogleAiStudioStreamSetup } from "@app/lib/model_constructors/test/endpoints/google_gemini_3_1_pro_global_google_ai_studio.test";
import { GoogleGeminiThreeDotFiveFlashGlobalAgentPlatformStreamSetup } from "@app/lib/model_constructors/test/endpoints/google_gemini_3_5_flash_global_agent_platform.test";
import { GoogleGeminiThreeDotFiveFlashGlobalGoogleAiStudioStreamSetup } from "@app/lib/model_constructors/test/endpoints/google_gemini_3_5_flash_global_google_ai_studio.test";
import { GoogleGeminiThreeDotFiveFlashLiteGlobalAgentPlatformStreamSetup } from "@app/lib/model_constructors/test/endpoints/google_gemini_3_5_flash_lite_global_agent_platform.test";
import { GoogleGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioStreamSetup } from "@app/lib/model_constructors/test/endpoints/google_gemini_3_5_flash_lite_global_google_ai_studio.test";
import { GoogleGeminiThreeDotSixFlashGlobalAgentPlatformStreamSetup } from "@app/lib/model_constructors/test/endpoints/google_gemini_3_6_flash_global_agent_platform.test";
import { GoogleGeminiThreeDotSixFlashGlobalGoogleAiStudioStreamSetup } from "@app/lib/model_constructors/test/endpoints/google_gemini_3_6_flash_global_google_ai_studio.test";
import { GoogleGeminiThreeDotSevenFlashGlobalAgentPlatformStreamSetup } from "@app/lib/model_constructors/test/endpoints/google_gemini_3_7_flash_global_agent_platform.test";
import { GoogleGeminiThreeDotSevenFlashGlobalGoogleAiStudioStreamSetup } from "@app/lib/model_constructors/test/endpoints/google_gemini_3_7_flash_global_google_ai_studio.test";
import { GoogleGeminiThreeDotEightFlashEuropeAgentPlatformStreamSetup } from "@app/lib/model_constructors/test/endpoints/google_gemini_3_8_flash_eu_agent_platform.test";
import { GoogleGeminiThreeDotEightFlashGlobalAgentPlatformStreamSetup } from "@app/lib/model_constructors/test/endpoints/google_gemini_3_8_flash_global_agent_platform.test";
import { GoogleGeminiThreeDotEightFlashGlobalGoogleAiStudioStreamSetup } from "@app/lib/model_constructors/test/endpoints/google_gemini_3_8_flash_global_google_ai_studio.test";
import { MistralCodestralEuropeMistralStreamSetup } from "@app/lib/model_constructors/test/endpoints/mistral_codestral_eu_mistral.test";
import { MistralMistralLargeEuropeMistralStreamSetup } from "@app/lib/model_constructors/test/endpoints/mistral_mistral_large_eu_mistral.test";
import { MistralMistralMedium35EuropeMistralStreamSetup } from "@app/lib/model_constructors/test/endpoints/mistral_mistral_medium_3_5_eu_mistral.test";
import { MistralMistralSmallEuropeMistralStreamSetup } from "@app/lib/model_constructors/test/endpoints/mistral_mistral_small_eu_mistral.test";
import { MoonshotAiKimiK2Dot6GlobalFireworksStreamSetup } from "@app/lib/model_constructors/test/endpoints/moonshot_ai_kimi_k2_dot_six_global_fireworks.test";
import { MoonshotAiKimiK3GlobalFireworksStreamSetup } from "@app/lib/model_constructors/test/endpoints/moonshot_ai_kimi_k3_global_fireworks.test";
import { NoopNoopGlobalNoopStreamSetup } from "@app/lib/model_constructors/test/endpoints/noop_noop_global_noop.test";
import { OpenAIGptFiveDotFiveEuropeOpenAIResponsesStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_gpt_five_dot_five_eu_openai_responses.test";
import { OpenAIGptFiveDotFiveGlobalOpenAIResponsesStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_gpt_five_dot_five_global_openai_responses.test";
import { OpenAIGptFiveDotFourEuropeOpenAIResponsesStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_gpt_five_dot_four_eu_openai_responses.test";
import { OpenAIGptFiveDotFourGlobalOpenAIResponsesStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_gpt_five_dot_four_global_openai_responses.test";
import { OpenAIGptFiveDotFourMiniEuropeOpenAIResponsesStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_gpt_five_dot_four_mini_eu_openai_responses.test";
import { OpenAIGptFiveDotFourMiniGlobalOpenAIResponsesStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_gpt_five_dot_four_mini_global_openai_responses.test";
import { OpenAIGptFiveDotFourNanoEuropeOpenAIResponsesStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_gpt_five_dot_four_nano_eu_openai_responses.test";
import { OpenAIGptFiveDotFourNanoGlobalOpenAIResponsesStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_gpt_five_dot_four_nano_global_openai_responses.test";
import { OpenAIGptFiveDotOneEuropeOpenAIResponsesStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_gpt_five_dot_one_eu_openai_responses.test";
import { OpenAIGptFiveDotOneGlobalOpenAIResponsesStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_gpt_five_dot_one_global_openai_responses.test";
import { OpenAIGptFiveDotSixLunaEuropeOpenAIResponsesStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_gpt_five_dot_six_luna_eu_openai_responses.test";
import { OpenAIGptFiveDotSixLunaGlobalOpenAIResponsesStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_gpt_five_dot_six_luna_global_openai_responses.test";
import { OpenAIGptFiveDotSixSolEuropeOpenAIResponsesStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_gpt_five_dot_six_sol_eu_openai_responses.test";
import { OpenAIGptFiveDotSixSolGlobalOpenAIResponsesStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_gpt_five_dot_six_sol_global_openai_responses.test";
import { OpenAIGptFiveDotSixTerraEuropeOpenAIResponsesStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_gpt_five_dot_six_terra_eu_openai_responses.test";
import { OpenAIGptFiveDotSixTerraGlobalOpenAIResponsesStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_gpt_five_dot_six_terra_global_openai_responses.test";
import { OpenAIGptFiveDotSixTerraLongContextEuropeOpenAIResponsesStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_gpt_five_dot_six_terra_long_context_eu_openai_responses.test";
import { OpenAIGptFiveDotSixTerraLongContextGlobalOpenAIResponsesStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_gpt_five_dot_six_terra_long_context_global_openai_responses.test";
import { OpenAIGptFiveDotTwoEuropeOpenAIResponsesStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_gpt_five_dot_two_eu_openai_responses.test";
import { OpenAIGptFiveDotTwoGlobalOpenAIResponsesStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_gpt_five_dot_two_global_openai_responses.test";
import { OpenAIGptFiveEuropeOpenAIResponsesStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_gpt_five_eu_openai_responses.test";
import { OpenAIGptFiveGlobalOpenAIResponsesStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_gpt_five_global_openai_responses.test";
import { OpenAIGptFiveMiniEuropeOpenAIResponsesStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_gpt_five_mini_eu_openai_responses.test";
import { OpenAIGptFiveMiniGlobalOpenAIResponsesStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_gpt_five_mini_global_openai_responses.test";
import { OpenAIGptFiveNanoEuropeOpenAIResponsesStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_gpt_five_nano_eu_openai_responses.test";
import { OpenAIGptFiveNanoGlobalOpenAIResponsesStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_gpt_five_nano_global_openai_responses.test";
import { ThinkingMachinesInklingGlobalFireworksStreamSetup } from "@app/lib/model_constructors/test/endpoints/thinking_machines_inkling_global_fireworks.test";
import { XaiGrokFourDotFiveGlobalXaiStreamSetup } from "@app/lib/model_constructors/test/endpoints/xai_grok_four_dot_five_global_xai.test";
import { XaiGrokFourDotSixGlobalXaiStreamSetup } from "@app/lib/model_constructors/test/endpoints/xai_grok_four_dot_six_global_xai.test";
import { ZAiGlmFiveDotThreeFlashGlobalFireworksStreamSetup } from "@app/lib/model_constructors/test/endpoints/z_ai_glm_five_dot_three_flash_global_fireworks.test";
import { ZAiGlmFiveDotTwoGlobalFireworksStreamSetup } from "@app/lib/model_constructors/test/endpoints/z_ai_glm_five_dot_two_global_fireworks.test";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

export const STREAM_ENDPOINT_SETUPS = {
  [GoogleGeminiThreeDotEightFlashEuropeAgentPlatformStream.id]:
    GoogleGeminiThreeDotEightFlashEuropeAgentPlatformStreamSetup,
  [AnthropicClaudeHaikuFourDotFiveEuropeAgentPlatformStream.id]:
    AnthropicClaudeHaikuFourDotFiveEuropeAgentPlatformStreamSetup,
  [AnthropicClaudeOpusFourDotEightEuropeAgentPlatformStream.id]:
    AnthropicClaudeOpusFourDotEightEuropeAgentPlatformStreamSetup,
  [AnthropicClaudeOpusFourDotSevenEuropeAgentPlatformStream.id]:
    AnthropicClaudeOpusFourDotSevenEuropeAgentPlatformStreamSetup,
  [AnthropicClaudeOpusFourDotSixEuropeAgentPlatformStream.id]:
    AnthropicClaudeOpusFourDotSixEuropeAgentPlatformStreamSetup,
  [AnthropicClaudeSonnetFiveEuropeAgentPlatformStream.id]:
    AnthropicClaudeSonnetFiveEuropeAgentPlatformStreamSetup,
  [AnthropicClaudeSonnetFourDotSixEuropeAgentPlatformStream.id]:
    AnthropicClaudeSonnetFourDotSixEuropeAgentPlatformStreamSetup,
  [GoogleGeminiThreeDotFiveFlashGlobalAgentPlatformStream.id]:
    GoogleGeminiThreeDotFiveFlashGlobalAgentPlatformStreamSetup,
  [GoogleGeminiThreeDotSixFlashGlobalAgentPlatformStream.id]:
    GoogleGeminiThreeDotSixFlashGlobalAgentPlatformStreamSetup,
  [GoogleGeminiThreeDotSevenFlashGlobalAgentPlatformStream.id]:
    GoogleGeminiThreeDotSevenFlashGlobalAgentPlatformStreamSetup,
  [GoogleGeminiThreeDotEightFlashGlobalAgentPlatformStream.id]:
    GoogleGeminiThreeDotEightFlashGlobalAgentPlatformStreamSetup,
  [GoogleGeminiThreeDotOneFlashLiteGlobalAgentPlatformStream.id]:
    GoogleGeminiThreeDotOneFlashLiteGlobalAgentPlatformStreamSetup,
  [GoogleGeminiThreeDotFiveFlashLiteGlobalAgentPlatformStream.id]:
    GoogleGeminiThreeDotFiveFlashLiteGlobalAgentPlatformStreamSetup,
  [GoogleGeminiThreeDotOneProGlobalAgentPlatformStream.id]:
    GoogleGeminiThreeDotOneProGlobalAgentPlatformStreamSetup,
  [AnthropicClaudeFableFiveGlobalAnthropicStream.id]:
    AnthropicClaudeFableFiveGlobalAnthropicStreamSetup,
  [AnthropicClaudeHaikuFourDotFiveGlobalAnthropicStream.id]:
    AnthropicClaudeHaikuFourDotFiveGlobalAnthropicStreamSetup,
  [AnthropicClaudeOpusFiveGlobalAnthropicStream.id]:
    AnthropicClaudeOpusFiveGlobalAnthropicStreamSetup,
  [AnthropicClaudeOpusFourDotEightGlobalAnthropicStream.id]:
    AnthropicClaudeOpusFourDotEightGlobalAnthropicStreamSetup,
  [AnthropicClaudeOpusFourDotSevenGlobalAnthropicStream.id]:
    AnthropicClaudeOpusFourDotSevenGlobalAnthropicStreamSetup,
  [AnthropicClaudeOpusFourDotSixGlobalAnthropicStream.id]:
    AnthropicClaudeOpusFourDotSixGlobalAnthropicStreamSetup,
  [AnthropicClaudeSonnetFiveGlobalAnthropicStream.id]:
    AnthropicClaudeSonnetFiveGlobalAnthropicStreamSetup,
  [AnthropicClaudeSonnetFourDotSixGlobalAnthropicStream.id]:
    AnthropicClaudeSonnetFourDotSixGlobalAnthropicStreamSetup,
  [DeepSeekDeepSeekV4ProGlobalFireworksStream.id]:
    DeepSeekDeepSeekV4ProGlobalFireworksStreamSetup,
  [DeepSeekDeepSeekV4Flash0731GlobalFireworksStream.id]:
    DeepSeekDeepSeekV4Flash0731GlobalFireworksStreamSetup,
  [ZAiGlmFiveDotTwoGlobalFireworksStream.id]:
    ZAiGlmFiveDotTwoGlobalFireworksStreamSetup,
  [ZAiGlmFiveDotThreeFlashGlobalFireworksStream.id]:
    ZAiGlmFiveDotThreeFlashGlobalFireworksStreamSetup,
  [MoonshotAiKimiK2Dot6GlobalFireworksStream.id]:
    MoonshotAiKimiK2Dot6GlobalFireworksStreamSetup,
  [MoonshotAiKimiK3GlobalFireworksStream.id]:
    MoonshotAiKimiK3GlobalFireworksStreamSetup,
  [ThinkingMachinesInklingGlobalFireworksStream.id]:
    ThinkingMachinesInklingGlobalFireworksStreamSetup,
  [GoogleGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioStream.id]:
    GoogleGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioStreamSetup,
  [GoogleGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioStream.id]:
    GoogleGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioStreamSetup,
  [GoogleGeminiThreeDotOneProGlobalGoogleAiStudioStream.id]:
    GoogleGeminiThreeDotOneProGlobalGoogleAiStudioStreamSetup,
  [GoogleGeminiThreeDotFiveFlashGlobalGoogleAiStudioStream.id]:
    GoogleGeminiThreeDotFiveFlashGlobalGoogleAiStudioStreamSetup,
  [GoogleGeminiThreeDotSixFlashGlobalGoogleAiStudioStream.id]:
    GoogleGeminiThreeDotSixFlashGlobalGoogleAiStudioStreamSetup,
  [GoogleGeminiThreeDotSevenFlashGlobalGoogleAiStudioStream.id]:
    GoogleGeminiThreeDotSevenFlashGlobalGoogleAiStudioStreamSetup,
  [GoogleGeminiThreeDotEightFlashGlobalGoogleAiStudioStream.id]:
    GoogleGeminiThreeDotEightFlashGlobalGoogleAiStudioStreamSetup,
  [MistralCodestralEuropeMistralStream.id]:
    MistralCodestralEuropeMistralStreamSetup,
  [MistralMistralLargeEuropeMistralStream.id]:
    MistralMistralLargeEuropeMistralStreamSetup,
  [MistralMistralMedium35EuropeMistralStream.id]:
    MistralMistralMedium35EuropeMistralStreamSetup,
  [MistralMistralSmallEuropeMistralStream.id]:
    MistralMistralSmallEuropeMistralStreamSetup,
  [NoopNoopGlobalNoopStream.id]: NoopNoopGlobalNoopStreamSetup,
  [OpenAIGptFiveDotFiveEuropeOpenAIResponsesStream.id]:
    OpenAIGptFiveDotFiveEuropeOpenAIResponsesStreamSetup,
  [OpenAIGptFiveDotFourMiniEuropeOpenAIResponsesStream.id]:
    OpenAIGptFiveDotFourMiniEuropeOpenAIResponsesStreamSetup,
  [OpenAIGptFiveDotFourNanoEuropeOpenAIResponsesStream.id]:
    OpenAIGptFiveDotFourNanoEuropeOpenAIResponsesStreamSetup,
  [OpenAIGptFiveDotFourEuropeOpenAIResponsesStream.id]:
    OpenAIGptFiveDotFourEuropeOpenAIResponsesStreamSetup,
  [OpenAIGptFiveDotOneEuropeOpenAIResponsesStream.id]:
    OpenAIGptFiveDotOneEuropeOpenAIResponsesStreamSetup,
  [OpenAIGptFiveDotSixLunaEuropeOpenAIResponsesStream.id]:
    OpenAIGptFiveDotSixLunaEuropeOpenAIResponsesStreamSetup,
  [OpenAIGptFiveDotSixSolEuropeOpenAIResponsesStream.id]:
    OpenAIGptFiveDotSixSolEuropeOpenAIResponsesStreamSetup,
  [OpenAIGptFiveDotSixTerraEuropeOpenAIResponsesStream.id]:
    OpenAIGptFiveDotSixTerraEuropeOpenAIResponsesStreamSetup,
  [OpenAIGptFiveDotSixTerraLongContextEuropeOpenAIResponsesStream.id]:
    OpenAIGptFiveDotSixTerraLongContextEuropeOpenAIResponsesStreamSetup,
  [OpenAIGptFiveDotTwoEuropeOpenAIResponsesStream.id]:
    OpenAIGptFiveDotTwoEuropeOpenAIResponsesStreamSetup,
  [OpenAIGptFiveMiniEuropeOpenAIResponsesStream.id]:
    OpenAIGptFiveMiniEuropeOpenAIResponsesStreamSetup,
  [OpenAIGptFiveNanoEuropeOpenAIResponsesStream.id]:
    OpenAIGptFiveNanoEuropeOpenAIResponsesStreamSetup,
  [OpenAIGptFiveEuropeOpenAIResponsesStream.id]:
    OpenAIGptFiveEuropeOpenAIResponsesStreamSetup,
  [OpenAIGptFiveDotFiveGlobalOpenAIResponsesStream.id]:
    OpenAIGptFiveDotFiveGlobalOpenAIResponsesStreamSetup,
  [OpenAIGptFiveDotFourMiniGlobalOpenAIResponsesStream.id]:
    OpenAIGptFiveDotFourMiniGlobalOpenAIResponsesStreamSetup,
  [OpenAIGptFiveDotFourNanoGlobalOpenAIResponsesStream.id]:
    OpenAIGptFiveDotFourNanoGlobalOpenAIResponsesStreamSetup,
  [OpenAIGptFiveDotFourGlobalOpenAIResponsesStream.id]:
    OpenAIGptFiveDotFourGlobalOpenAIResponsesStreamSetup,
  [OpenAIGptFiveDotOneGlobalOpenAIResponsesStream.id]:
    OpenAIGptFiveDotOneGlobalOpenAIResponsesStreamSetup,
  [OpenAIGptFiveDotSixLunaGlobalOpenAIResponsesStream.id]:
    OpenAIGptFiveDotSixLunaGlobalOpenAIResponsesStreamSetup,
  [OpenAIGptFiveDotSixSolGlobalOpenAIResponsesStream.id]:
    OpenAIGptFiveDotSixSolGlobalOpenAIResponsesStreamSetup,
  [OpenAIGptFiveDotSixTerraGlobalOpenAIResponsesStream.id]:
    OpenAIGptFiveDotSixTerraGlobalOpenAIResponsesStreamSetup,
  [OpenAIGptFiveDotSixTerraLongContextGlobalOpenAIResponsesStream.id]:
    OpenAIGptFiveDotSixTerraLongContextGlobalOpenAIResponsesStreamSetup,
  [OpenAIGptFiveDotTwoGlobalOpenAIResponsesStream.id]:
    OpenAIGptFiveDotTwoGlobalOpenAIResponsesStreamSetup,
  [OpenAIGptFiveMiniGlobalOpenAIResponsesStream.id]:
    OpenAIGptFiveMiniGlobalOpenAIResponsesStreamSetup,
  [OpenAIGptFiveNanoGlobalOpenAIResponsesStream.id]:
    OpenAIGptFiveNanoGlobalOpenAIResponsesStreamSetup,
  [OpenAIGptFiveGlobalOpenAIResponsesStream.id]:
    OpenAIGptFiveGlobalOpenAIResponsesStreamSetup,
  [XaiGrokFourDotFiveGlobalXaiStream.id]:
    XaiGrokFourDotFiveGlobalXaiStreamSetup,
  [XaiGrokFourDotSixGlobalXaiStream.id]: XaiGrokFourDotSixGlobalXaiStreamSetup,
} satisfies Record<StreamEndpointId, StreamSetup>;
