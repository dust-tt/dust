import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { AgentPlatformEuropeClaudeHaikuFourDotFiveStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_haiku_four_dot_five";
import { AgentPlatformEuropeClaudeSonnetFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_sonnet_four_dot_six";
import { AnthropicGlobalClaudeOpusFourDotEightStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_opus_four_dot_eight";
import { AnthropicGlobalClaudeOpusFourDotSevenStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_opus_four_dot_seven";
import { AnthropicGlobalClaudeOpusFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_opus_four_dot_six";
import { AnthropicGlobalClaudeSonnetFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_sonnet_four_dot_six";
import { GoogleAiStudioGlobalGeminiThreeDotOneFlashLiteStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_global_gemini_3_1_flash_lite";
import { GoogleAiStudioGlobalGeminiThreeDotOneProStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_global_gemini_3_1_pro";
import { GoogleAiStudioGlobalGeminiThreeDotFiveFlashStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_global_gemini_3_5_flash";
import { OpenAIResponsesGlobalGptFiveStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five";
import { OpenAIResponsesGlobalGptFiveDotFiveStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_five";
import { OpenAIResponsesGlobalGptFiveDotFourStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_four";
import { OpenAIResponsesGlobalGptFiveDotFourMiniStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_four_mini";
import { OpenAIResponsesGlobalGptFiveDotFourNanoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_four_nano";
import { OpenAIResponsesGlobalGptFiveDotOneStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_one";
import { OpenAIResponsesGlobalGptFiveDotTwoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_two";
import { OpenAIResponsesGlobalGptFiveMiniStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_mini";
import { OpenAIResponsesGlobalGptFiveNanoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_nano";

export const STREAM_ENDPOINTS = {
  [AnthropicGlobalClaudeSonnetFourDotSixStream.id]:
    AnthropicGlobalClaudeSonnetFourDotSixStream,
  [AnthropicGlobalClaudeOpusFourDotEightStream.id]:
    AnthropicGlobalClaudeOpusFourDotEightStream,
  [AnthropicGlobalClaudeOpusFourDotSevenStream.id]:
    AnthropicGlobalClaudeOpusFourDotSevenStream,
  [AnthropicGlobalClaudeOpusFourDotSixStream.id]:
    AnthropicGlobalClaudeOpusFourDotSixStream,
  [AgentPlatformEuropeClaudeSonnetFourDotSixStream.id]:
    AgentPlatformEuropeClaudeSonnetFourDotSixStream,
  [GoogleAiStudioGlobalGeminiThreeDotOneProStream.id]:
    GoogleAiStudioGlobalGeminiThreeDotOneProStream,
  [GoogleAiStudioGlobalGeminiThreeDotFiveFlashStream.id]:
    GoogleAiStudioGlobalGeminiThreeDotFiveFlashStream,
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
  [GoogleAiStudioGlobalGeminiThreeDotOneFlashLiteStream.id]:
    GoogleAiStudioGlobalGeminiThreeDotOneFlashLiteStream,
} as const satisfies Record<string, StreamEndpointConstructor>;

export type StreamEndpointId = keyof typeof STREAM_ENDPOINTS;
