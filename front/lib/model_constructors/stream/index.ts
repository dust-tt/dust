import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { AgentPlatformEuropeClaudeHaikuFourDotFiveStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_haiku_four_dot_five";
import { AgentPlatformEuropeClaudeOpusFourDotEightStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_opus_four_dot_eight";
import { AgentPlatformEuropeClaudeOpusFourDotSevenStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_opus_four_dot_seven";
import { AgentPlatformEuropeClaudeOpusFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_opus_four_dot_six";
import { AgentPlatformEuropeClaudeSonnetFiveStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_sonnet_five";
import { AgentPlatformEuropeClaudeSonnetFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_sonnet_four_dot_six";
import { AgentPlatformEuropeGeminiThreeDotOneFlashLiteStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_gemini_3_1_flash_lite";
import { AgentPlatformEuropeGeminiThreeDotFiveFlashStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_gemini_3_5_flash";
import { AgentPlatformGlobalGeminiThreeDotOneFlashLiteStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_global_gemini_3_1_flash_lite";
import { AgentPlatformGlobalGeminiThreeDotOneProStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_global_gemini_3_1_pro";
import { AgentPlatformGlobalGeminiThreeDotFiveFlashStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_global_gemini_3_5_flash";
import { AnthropicGlobalClaudeFableFiveStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_fable_five";
import { AnthropicGlobalClaudeHaikuFourDotFiveStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_haiku_four_dot_five";
import { AnthropicGlobalClaudeOpusFourDotEightStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_opus_four_dot_eight";
import { AnthropicGlobalClaudeOpusFourDotSevenStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_opus_four_dot_seven";
import { AnthropicGlobalClaudeOpusFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_opus_four_dot_six";
import { AnthropicGlobalClaudeSonnetFiveStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_sonnet_five";
import { AnthropicGlobalClaudeSonnetFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_sonnet_four_dot_six";
import { FireworksGlobalDeepSeekV4ProStream } from "@app/lib/model_constructors/stream/endpoints/fireworks_global_deepseek_v4_pro";
import { FireworksGlobalGlmFiveDotTwoStream } from "@app/lib/model_constructors/stream/endpoints/fireworks_global_glm_five_dot_two";
import { FireworksGlobalKimiK2Dot5Stream } from "@app/lib/model_constructors/stream/endpoints/fireworks_global_kimi_k2_dot_five";
import { FireworksGlobalKimiK2Dot6Stream } from "@app/lib/model_constructors/stream/endpoints/fireworks_global_kimi_k2_dot_six";
import { GoogleAiStudioGlobalGeminiThreeDotOneFlashLiteStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_global_gemini_3_1_flash_lite";
import { GoogleAiStudioGlobalGeminiThreeDotOneProStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_global_gemini_3_1_pro";
import { GoogleAiStudioGlobalGeminiThreeDotFiveFlashStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_global_gemini_3_5_flash";
import { MistralEuropeCodestralStream } from "@app/lib/model_constructors/stream/endpoints/mistral_eu_codestral";
import { MistralEuropeMistralLargeStream } from "@app/lib/model_constructors/stream/endpoints/mistral_eu_mistral_large";
import { MistralEuropeMistralMedium35Stream } from "@app/lib/model_constructors/stream/endpoints/mistral_eu_mistral_medium_3_5";
import { MistralEuropeMistralSmallStream } from "@app/lib/model_constructors/stream/endpoints/mistral_eu_mistral_small";
import { NoopGlobalNoopStream } from "@app/lib/model_constructors/stream/endpoints/noop_global_noop";
import { OpenAIResponsesEuropeGptFiveStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five";
import { OpenAIResponsesEuropeGptFiveDotFiveStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_five";
import { OpenAIResponsesEuropeGptFiveDotFourStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_four";
import { OpenAIResponsesEuropeGptFiveDotFourMiniStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_four_mini";
import { OpenAIResponsesEuropeGptFiveDotFourNanoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_four_nano";
import { OpenAIResponsesEuropeGptFiveDotOneStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_one";
import { OpenAIResponsesEuropeGptFiveDotSixLunaStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_six_luna";
import { OpenAIResponsesEuropeGptFiveDotSixSolStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_six_sol";
import { OpenAIResponsesEuropeGptFiveDotSixTerraStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_six_terra";
import { OpenAIResponsesEuropeGptFiveDotTwoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_two";
import { OpenAIResponsesEuropeGptFiveMiniStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_mini";
import { OpenAIResponsesEuropeGptFiveNanoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_nano";
import { OpenAIResponsesGlobalGptFiveStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five";
import { OpenAIResponsesGlobalGptFiveDotFiveStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_five";
import { OpenAIResponsesGlobalGptFiveDotFourStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_four";
import { OpenAIResponsesGlobalGptFiveDotFourMiniStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_four_mini";
import { OpenAIResponsesGlobalGptFiveDotFourNanoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_four_nano";
import { OpenAIResponsesGlobalGptFiveDotOneStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_one";
import { OpenAIResponsesGlobalGptFiveDotSixLunaStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_six_luna";
import { OpenAIResponsesGlobalGptFiveDotSixSolStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_six_sol";
import { OpenAIResponsesGlobalGptFiveDotSixTerraStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_six_terra";
import { OpenAIResponsesGlobalGptFiveDotTwoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_two";
import { OpenAIResponsesGlobalGptFiveMiniStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_mini";
import { OpenAIResponsesGlobalGptFiveNanoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_nano";

export const STREAM_ENDPOINTS = {
  [AgentPlatformEuropeClaudeHaikuFourDotFiveStream.id]:
    AgentPlatformEuropeClaudeHaikuFourDotFiveStream,
  [AgentPlatformEuropeClaudeOpusFourDotEightStream.id]:
    AgentPlatformEuropeClaudeOpusFourDotEightStream,
  [AgentPlatformEuropeClaudeOpusFourDotSevenStream.id]:
    AgentPlatformEuropeClaudeOpusFourDotSevenStream,
  [AgentPlatformEuropeClaudeOpusFourDotSixStream.id]:
    AgentPlatformEuropeClaudeOpusFourDotSixStream,
  [AgentPlatformEuropeClaudeSonnetFiveStream.id]:
    AgentPlatformEuropeClaudeSonnetFiveStream,
  [AgentPlatformEuropeClaudeSonnetFourDotSixStream.id]:
    AgentPlatformEuropeClaudeSonnetFourDotSixStream,
  [AgentPlatformEuropeGeminiThreeDotFiveFlashStream.id]:
    AgentPlatformEuropeGeminiThreeDotFiveFlashStream,
  [AgentPlatformEuropeGeminiThreeDotOneFlashLiteStream.id]:
    AgentPlatformEuropeGeminiThreeDotOneFlashLiteStream,
  [AgentPlatformGlobalGeminiThreeDotFiveFlashStream.id]:
    AgentPlatformGlobalGeminiThreeDotFiveFlashStream,
  [AgentPlatformGlobalGeminiThreeDotOneFlashLiteStream.id]:
    AgentPlatformGlobalGeminiThreeDotOneFlashLiteStream,
  [AgentPlatformGlobalGeminiThreeDotOneProStream.id]:
    AgentPlatformGlobalGeminiThreeDotOneProStream,
  [AnthropicGlobalClaudeFableFiveStream.id]:
    AnthropicGlobalClaudeFableFiveStream,
  [AnthropicGlobalClaudeHaikuFourDotFiveStream.id]:
    AnthropicGlobalClaudeHaikuFourDotFiveStream,
  [AnthropicGlobalClaudeOpusFourDotEightStream.id]:
    AnthropicGlobalClaudeOpusFourDotEightStream,
  [AnthropicGlobalClaudeOpusFourDotSevenStream.id]:
    AnthropicGlobalClaudeOpusFourDotSevenStream,
  [AnthropicGlobalClaudeOpusFourDotSixStream.id]:
    AnthropicGlobalClaudeOpusFourDotSixStream,
  [AnthropicGlobalClaudeSonnetFiveStream.id]:
    AnthropicGlobalClaudeSonnetFiveStream,
  [AnthropicGlobalClaudeSonnetFourDotSixStream.id]:
    AnthropicGlobalClaudeSonnetFourDotSixStream,
  [FireworksGlobalDeepSeekV4ProStream.id]: FireworksGlobalDeepSeekV4ProStream,
  [FireworksGlobalGlmFiveDotTwoStream.id]: FireworksGlobalGlmFiveDotTwoStream,
  [FireworksGlobalKimiK2Dot5Stream.id]: FireworksGlobalKimiK2Dot5Stream,
  [FireworksGlobalKimiK2Dot6Stream.id]: FireworksGlobalKimiK2Dot6Stream,
  [GoogleAiStudioGlobalGeminiThreeDotOneFlashLiteStream.id]:
    GoogleAiStudioGlobalGeminiThreeDotOneFlashLiteStream,
  [GoogleAiStudioGlobalGeminiThreeDotOneProStream.id]:
    GoogleAiStudioGlobalGeminiThreeDotOneProStream,
  [GoogleAiStudioGlobalGeminiThreeDotFiveFlashStream.id]:
    GoogleAiStudioGlobalGeminiThreeDotFiveFlashStream,
  [MistralEuropeCodestralStream.id]: MistralEuropeCodestralStream,
  [MistralEuropeMistralLargeStream.id]: MistralEuropeMistralLargeStream,
  [MistralEuropeMistralMedium35Stream.id]: MistralEuropeMistralMedium35Stream,
  [MistralEuropeMistralSmallStream.id]: MistralEuropeMistralSmallStream,
  [NoopGlobalNoopStream.id]: NoopGlobalNoopStream,
  [OpenAIResponsesEuropeGptFiveDotFiveStream.id]:
    OpenAIResponsesEuropeGptFiveDotFiveStream,
  [OpenAIResponsesEuropeGptFiveDotFourMiniStream.id]:
    OpenAIResponsesEuropeGptFiveDotFourMiniStream,
  [OpenAIResponsesEuropeGptFiveDotFourNanoStream.id]:
    OpenAIResponsesEuropeGptFiveDotFourNanoStream,
  [OpenAIResponsesEuropeGptFiveDotFourStream.id]:
    OpenAIResponsesEuropeGptFiveDotFourStream,
  [OpenAIResponsesEuropeGptFiveDotOneStream.id]:
    OpenAIResponsesEuropeGptFiveDotOneStream,
  [OpenAIResponsesEuropeGptFiveDotSixLunaStream.id]:
    OpenAIResponsesEuropeGptFiveDotSixLunaStream,
  [OpenAIResponsesEuropeGptFiveDotSixSolStream.id]:
    OpenAIResponsesEuropeGptFiveDotSixSolStream,
  [OpenAIResponsesEuropeGptFiveDotSixTerraStream.id]:
    OpenAIResponsesEuropeGptFiveDotSixTerraStream,
  [OpenAIResponsesEuropeGptFiveDotTwoStream.id]:
    OpenAIResponsesEuropeGptFiveDotTwoStream,
  [OpenAIResponsesEuropeGptFiveMiniStream.id]:
    OpenAIResponsesEuropeGptFiveMiniStream,
  [OpenAIResponsesEuropeGptFiveNanoStream.id]:
    OpenAIResponsesEuropeGptFiveNanoStream,
  [OpenAIResponsesEuropeGptFiveStream.id]: OpenAIResponsesEuropeGptFiveStream,
  [OpenAIResponsesGlobalGptFiveDotFiveStream.id]:
    OpenAIResponsesGlobalGptFiveDotFiveStream,
  [OpenAIResponsesGlobalGptFiveDotFourMiniStream.id]:
    OpenAIResponsesGlobalGptFiveDotFourMiniStream,
  [OpenAIResponsesGlobalGptFiveDotFourNanoStream.id]:
    OpenAIResponsesGlobalGptFiveDotFourNanoStream,
  [OpenAIResponsesGlobalGptFiveDotFourStream.id]:
    OpenAIResponsesGlobalGptFiveDotFourStream,
  [OpenAIResponsesGlobalGptFiveDotOneStream.id]:
    OpenAIResponsesGlobalGptFiveDotOneStream,
  [OpenAIResponsesGlobalGptFiveDotSixLunaStream.id]:
    OpenAIResponsesGlobalGptFiveDotSixLunaStream,
  [OpenAIResponsesGlobalGptFiveDotSixSolStream.id]:
    OpenAIResponsesGlobalGptFiveDotSixSolStream,
  [OpenAIResponsesGlobalGptFiveDotSixTerraStream.id]:
    OpenAIResponsesGlobalGptFiveDotSixTerraStream,
  [OpenAIResponsesGlobalGptFiveDotTwoStream.id]:
    OpenAIResponsesGlobalGptFiveDotTwoStream,
  [OpenAIResponsesGlobalGptFiveMiniStream.id]:
    OpenAIResponsesGlobalGptFiveMiniStream,
  [OpenAIResponsesGlobalGptFiveNanoStream.id]:
    OpenAIResponsesGlobalGptFiveNanoStream,
  [OpenAIResponsesGlobalGptFiveStream.id]: OpenAIResponsesGlobalGptFiveStream,
} as const satisfies Record<string, StreamEndpointConstructor>;

export type StreamEndpointId = keyof typeof STREAM_ENDPOINTS;
