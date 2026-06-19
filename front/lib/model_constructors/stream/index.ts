import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { AgentPlatformEuropeClaudeHaikuFourDotFiveStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_haiku_four_dot_five";
import { AgentPlatformEuropeClaudeSonnetFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_sonnet_four_dot_six";
import { AnthropicGlobalClaudeOpusFourDotEightStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_opus_four_dot_eight";
import { AnthropicGlobalClaudeSonnetFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_sonnet_four_dot_six";
import { GoogleAiStudioGlobalGemini31ProStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_global_gemini_3_1_pro";
import { OpenAIResponsesGlobalGptFiveDotFiveStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_five";

export const STREAM_ENDPOINTS = {
  [AnthropicGlobalClaudeSonnetFourDotSixStream.id]:
    AnthropicGlobalClaudeSonnetFourDotSixStream,
  [AnthropicGlobalClaudeOpusFourDotEightStream.id]:
    AnthropicGlobalClaudeOpusFourDotEightStream,
  [AgentPlatformEuropeClaudeSonnetFourDotSixStream.id]:
    AgentPlatformEuropeClaudeSonnetFourDotSixStream,
  [GoogleAiStudioGlobalGemini31ProStream.id]:
    GoogleAiStudioGlobalGemini31ProStream,
  [OpenAIResponsesGlobalGptFiveDotFiveStream.id]:
    OpenAIResponsesGlobalGptFiveDotFiveStream,
  [AgentPlatformEuropeClaudeHaikuFourDotFiveStream.id]:
    AgentPlatformEuropeClaudeHaikuFourDotFiveStream,
} as const satisfies Record<string, StreamEndpointConstructor>;

export type StreamEndpointId = keyof typeof STREAM_ENDPOINTS;
