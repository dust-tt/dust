import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { AgentPlatformEuropeClaudeHaikuFourDotFiveStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_haiku_four_dot_five";
import { AgentPlatformEuropeClaudeSonnetFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_sonnet_four_dot_six";
import { AgentPlatformEuropeGeminiThreeDotOneFlashLiteStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_gemini_3_1_flash_lite";
import { AgentPlatformEuropeGeminiThreeDotFiveFlashStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_gemini_3_5_flash";
import { AnthropicUsClaudeHaikuFourDotFiveStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_us_claude_haiku_four_dot_five";
import { AnthropicUsClaudeOpusFourDotEightStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_us_claude_opus_four_dot_eight";
import { AnthropicUsClaudeOpusFourDotSevenStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_us_claude_opus_four_dot_seven";
import { AnthropicUsClaudeOpusFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_us_claude_opus_four_dot_six";
import { AnthropicUsClaudeSonnetFiveStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_us_claude_sonnet_five";
import { AnthropicUsClaudeSonnetFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_us_claude_sonnet_four_dot_six";
import { FireworksUsDeepSeekV4ProStream } from "@app/lib/model_constructors/stream/endpoints/fireworks_us_deepseek_v4_pro";
import { FireworksUsGlmFiveDotTwoStream } from "@app/lib/model_constructors/stream/endpoints/fireworks_us_glm_five_dot_two";
import { FireworksUsKimiK2Dot5Stream } from "@app/lib/model_constructors/stream/endpoints/fireworks_us_kimi_k2_dot_five";
import { GoogleAiStudioUsGeminiThreeDotOneProStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_us_gemini_3_1_pro";
import { MistralEuropeCodestralStream } from "@app/lib/model_constructors/stream/endpoints/mistral_eu_codestral";
import { MistralEuropeMistralLargeStream } from "@app/lib/model_constructors/stream/endpoints/mistral_eu_mistral_large";
import { MistralEuropeMistralMedium35Stream } from "@app/lib/model_constructors/stream/endpoints/mistral_eu_mistral_medium_3_5";
import { MistralEuropeMistralSmallStream } from "@app/lib/model_constructors/stream/endpoints/mistral_eu_mistral_small";
import { OpenAIResponsesGlobalGptFiveStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five";
import { OpenAIResponsesGlobalGptFiveDotFiveStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_five";
import { OpenAIResponsesGlobalGptFiveDotFourStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_four";
import { OpenAIResponsesGlobalGptFiveDotFourMiniStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_four_mini";
import { OpenAIResponsesGlobalGptFiveDotFourNanoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_four_nano";
import { OpenAIResponsesGlobalGptFiveDotOneStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_one";
import { OpenAIResponsesGlobalGptFiveDotTwoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_two";
import { OpenAIResponsesGlobalGptFiveMiniStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_mini";
import { OpenAIResponsesGlobalGptFiveNanoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_nano";
import { TogetheraiUsLlama3370BInstructTurboStream } from "@app/lib/model_constructors/stream/endpoints/togetherai_us_llama_3_3_70b_instruct_turbo";

export const STREAM_ENDPOINTS = {
  [AnthropicUsClaudeSonnetFiveStream.id]: AnthropicUsClaudeSonnetFiveStream,
  [AnthropicUsClaudeSonnetFourDotSixStream.id]:
    AnthropicUsClaudeSonnetFourDotSixStream,
  [AnthropicUsClaudeHaikuFourDotFiveStream.id]:
    AnthropicUsClaudeHaikuFourDotFiveStream,
  [AnthropicUsClaudeOpusFourDotEightStream.id]:
    AnthropicUsClaudeOpusFourDotEightStream,
  [AnthropicUsClaudeOpusFourDotSevenStream.id]:
    AnthropicUsClaudeOpusFourDotSevenStream,
  [AnthropicUsClaudeOpusFourDotSixStream.id]:
    AnthropicUsClaudeOpusFourDotSixStream,
  [AgentPlatformEuropeClaudeSonnetFourDotSixStream.id]:
    AgentPlatformEuropeClaudeSonnetFourDotSixStream,
  [AgentPlatformEuropeGeminiThreeDotFiveFlashStream.id]:
    AgentPlatformEuropeGeminiThreeDotFiveFlashStream,
  [AgentPlatformEuropeGeminiThreeDotOneFlashLiteStream.id]:
    AgentPlatformEuropeGeminiThreeDotOneFlashLiteStream,
  [GoogleAiStudioUsGeminiThreeDotOneProStream.id]:
    GoogleAiStudioUsGeminiThreeDotOneProStream,
  [OpenAIResponsesGlobalGptFiveDotFiveStream.id]:
    OpenAIResponsesGlobalGptFiveDotFiveStream,
  [OpenAIResponsesGlobalGptFiveDotFourStream.id]:
    OpenAIResponsesGlobalGptFiveDotFourStream,
  [OpenAIResponsesGlobalGptFiveDotTwoStream.id]:
    OpenAIResponsesGlobalGptFiveDotTwoStream,
  [OpenAIResponsesGlobalGptFiveStream.id]: OpenAIResponsesGlobalGptFiveStream,
  [OpenAIResponsesGlobalGptFiveDotOneStream.id]:
    OpenAIResponsesGlobalGptFiveDotOneStream,
  [OpenAIResponsesGlobalGptFiveDotFourMiniStream.id]:
    OpenAIResponsesGlobalGptFiveDotFourMiniStream,
  [OpenAIResponsesGlobalGptFiveDotFourNanoStream.id]:
    OpenAIResponsesGlobalGptFiveDotFourNanoStream,
  [OpenAIResponsesGlobalGptFiveMiniStream.id]:
    OpenAIResponsesGlobalGptFiveMiniStream,
  [OpenAIResponsesGlobalGptFiveNanoStream.id]:
    OpenAIResponsesGlobalGptFiveNanoStream,
  [AgentPlatformEuropeClaudeHaikuFourDotFiveStream.id]:
    AgentPlatformEuropeClaudeHaikuFourDotFiveStream,
  [FireworksUsGlmFiveDotTwoStream.id]: FireworksUsGlmFiveDotTwoStream,
  [FireworksUsDeepSeekV4ProStream.id]: FireworksUsDeepSeekV4ProStream,
  [FireworksUsKimiK2Dot5Stream.id]: FireworksUsKimiK2Dot5Stream,
  [TogetheraiUsLlama3370BInstructTurboStream.id]:
    TogetheraiUsLlama3370BInstructTurboStream,
  [MistralEuropeMistralLargeStream.id]: MistralEuropeMistralLargeStream,
  [MistralEuropeMistralMedium35Stream.id]: MistralEuropeMistralMedium35Stream,
  [MistralEuropeMistralSmallStream.id]: MistralEuropeMistralSmallStream,
  [MistralEuropeCodestralStream.id]: MistralEuropeCodestralStream,
} as const satisfies Record<string, StreamEndpointConstructor>;

export type StreamEndpointId = keyof typeof STREAM_ENDPOINTS;
