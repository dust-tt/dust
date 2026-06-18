import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { AgentPlatformEuropeClaudeSonnetFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_sonnet_four_dot_six";
import { AnthropicGlobalClaudeSonnetFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_sonnet_four_dot_six";
import { GoogleAiStudioGlobalGemini31ProStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_global_gemini_3_1_pro";
import { OpenAIResponsesGlobalGptFiveDotFiveStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_five";

export const STREAM_ENDPOINTS = {
  [AnthropicGlobalClaudeSonnetFourDotSixStream.id]:
    AnthropicGlobalClaudeSonnetFourDotSixStream,
  [AgentPlatformEuropeClaudeSonnetFourDotSixStream.id]:
    AgentPlatformEuropeClaudeSonnetFourDotSixStream,
  [GoogleAiStudioGlobalGemini31ProStream.id]:
    GoogleAiStudioGlobalGemini31ProStream,
  [OpenAIResponsesGlobalGptFiveDotFiveStream.id]:
    OpenAIResponsesGlobalGptFiveDotFiveStream,
} as const satisfies Record<string, StreamEndpointConstructor>;

export type StreamEndpointId = keyof typeof STREAM_ENDPOINTS;
