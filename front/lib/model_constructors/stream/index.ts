import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { AgentPlatformEuropeClaudeHaikuFourDotFiveStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_haiku_four_dot_five";
import { AgentPlatformEuropeClaudeSonnetFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_sonnet_four_dot_six";
import { AgentPlatformEuropeGeminiThreeDotOneFlashLiteStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_gemini_3_1_flash_lite";
import { AgentPlatformEuropeGeminiThreeDotFiveFlashStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_gemini_3_5_flash";
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
import { GoogleAiStudioGlobalGeminiThreeDotOneProStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_global_gemini_3_1_pro";
import { MistralEuropeCodestralStream } from "@app/lib/model_constructors/stream/endpoints/mistral_eu_codestral";
import { MistralEuropeMistralLargeStream } from "@app/lib/model_constructors/stream/endpoints/mistral_eu_mistral_large";
import { MistralEuropeMistralMedium35Stream } from "@app/lib/model_constructors/stream/endpoints/mistral_eu_mistral_medium_3_5";
import { MistralEuropeMistralSmallStream } from "@app/lib/model_constructors/stream/endpoints/mistral_eu_mistral_small";
import { OpenAIResponsesEuropeGptFiveStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five";
import { OpenAIResponsesEuropeGptFiveDotFiveStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_five";
import { OpenAIResponsesEuropeGptFiveDotFourStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_four";
import { OpenAIResponsesEuropeGptFiveDotFourMiniStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_four_mini";
import { OpenAIResponsesEuropeGptFiveDotFourNanoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_four_nano";
import { OpenAIResponsesEuropeGptFiveDotOneStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_one";
import { OpenAIResponsesEuropeGptFiveDotTwoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_two";
import { OpenAIResponsesEuropeGptFiveMiniStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_mini";
import { OpenAIResponsesEuropeGptFiveNanoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_nano";
import { OpenAIResponsesGlobalGptFiveStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five";
import { OpenAIResponsesGlobalGptFiveDotFiveStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_five";
import { OpenAIResponsesGlobalGptFiveDotFourStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_four";
import { OpenAIResponsesGlobalGptFiveDotFourMiniStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_four_mini";
import { OpenAIResponsesGlobalGptFiveDotFourNanoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_four_nano";
import { OpenAIResponsesGlobalGptFiveDotOneStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_one";
import { OpenAIResponsesGlobalGptFiveDotTwoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_two";
import { OpenAIResponsesGlobalGptFiveMiniStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_mini";
import { OpenAIResponsesGlobalGptFiveNanoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_nano";
import { TogetheraiGlobalLlama3370BInstructTurboStream } from "@app/lib/model_constructors/stream/endpoints/togetherai_global_llama_3_3_70b_instruct_turbo";

export const STREAM_ENDPOINTS = {
  [AgentPlatformEuropeClaudeHaikuFourDotFiveStream.id]:
    AgentPlatformEuropeClaudeHaikuFourDotFiveStream,
  [AgentPlatformEuropeClaudeSonnetFourDotSixStream.id]:
    AgentPlatformEuropeClaudeSonnetFourDotSixStream,
  [AgentPlatformEuropeGeminiThreeDotFiveFlashStream.id]:
    AgentPlatformEuropeGeminiThreeDotFiveFlashStream,
  [AgentPlatformEuropeGeminiThreeDotOneFlashLiteStream.id]:
    AgentPlatformEuropeGeminiThreeDotOneFlashLiteStream,
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
  [GoogleAiStudioGlobalGeminiThreeDotOneProStream.id]:
    GoogleAiStudioGlobalGeminiThreeDotOneProStream,
  [MistralEuropeCodestralStream.id]: MistralEuropeCodestralStream,
  [MistralEuropeMistralLargeStream.id]: MistralEuropeMistralLargeStream,
  [MistralEuropeMistralMedium35Stream.id]: MistralEuropeMistralMedium35Stream,
  [MistralEuropeMistralSmallStream.id]: MistralEuropeMistralSmallStream,
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
  [OpenAIResponsesGlobalGptFiveDotTwoStream.id]:
    OpenAIResponsesGlobalGptFiveDotTwoStream,
  [OpenAIResponsesGlobalGptFiveMiniStream.id]:
    OpenAIResponsesGlobalGptFiveMiniStream,
  [OpenAIResponsesGlobalGptFiveNanoStream.id]:
    OpenAIResponsesGlobalGptFiveNanoStream,
  [OpenAIResponsesGlobalGptFiveStream.id]: OpenAIResponsesGlobalGptFiveStream,
  [TogetheraiGlobalLlama3370BInstructTurboStream.id]:
    TogetheraiGlobalLlama3370BInstructTurboStream,
} as const satisfies Record<string, StreamEndpointConstructor>;

export type StreamEndpointId = keyof typeof STREAM_ENDPOINTS;
