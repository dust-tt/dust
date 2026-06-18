import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { AgentPlatformEuropeClaudeSonnetFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_sonnet_four_dot_six";
import { AnthropicGlobalClaudeSonnetFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_sonnet_four_dot_six";
import { GoogleAiStudioGlobalGemini31FlashLiteStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_global_gemini_3_1_flash_lite";
import { GoogleAiStudioGlobalGemini31ProStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_global_gemini_3_1_pro";
import { GoogleAiStudioGlobalGemini35FlashStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_global_gemini_3_5_flash";
import { MistralEuropeMistralLargeStream } from "@app/lib/model_constructors/stream/endpoints/mistral_eu_mistral_large";
import { MistralEuropeMistralMedium35Stream } from "@app/lib/model_constructors/stream/endpoints/mistral_eu_mistral_medium_3_5";
import { OpenAIResponsesGlobalGptFiveDotFiveStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_five";

export const STREAM_ENDPOINTS = {
  [AnthropicGlobalClaudeSonnetFourDotSixStream.id]:
    AnthropicGlobalClaudeSonnetFourDotSixStream,
  [AgentPlatformEuropeClaudeSonnetFourDotSixStream.id]:
    AgentPlatformEuropeClaudeSonnetFourDotSixStream,
  [GoogleAiStudioGlobalGemini31ProStream.id]:
    GoogleAiStudioGlobalGemini31ProStream,
  [GoogleAiStudioGlobalGemini35FlashStream.id]:
    GoogleAiStudioGlobalGemini35FlashStream,
  [OpenAIResponsesGlobalGptFiveDotFiveStream.id]:
    OpenAIResponsesGlobalGptFiveDotFiveStream,
  [GoogleAiStudioGlobalGemini31FlashLiteStream.id]:
    GoogleAiStudioGlobalGemini31FlashLiteStream,
  [MistralEuropeMistralLargeStream.id]: MistralEuropeMistralLargeStream,
  [MistralEuropeMistralMedium35Stream.id]: MistralEuropeMistralMedium35Stream,
} as const satisfies Record<string, StreamEndpointConstructor>;

export type StreamEndpointId = keyof typeof STREAM_ENDPOINTS;
