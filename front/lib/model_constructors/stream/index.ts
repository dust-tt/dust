import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { AgentPlatformEuropeClaudeHaikuFourDotFiveStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_haiku_four_dot_five";
import { AgentPlatformEuropeClaudeSonnetFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_sonnet_four_dot_six";
import { AnthropicGlobalClaudeSonnetFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/anthropic_global_claude_sonnet_four_dot_six";
import { OpenAIResponsesGlobalGptFiveDotFiveStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_five";

export const STREAM_ENDPOINTS = {
  [AnthropicGlobalClaudeSonnetFourDotSixStream.id]:
    AnthropicGlobalClaudeSonnetFourDotSixStream,
  [AgentPlatformEuropeClaudeSonnetFourDotSixStream.id]:
    AgentPlatformEuropeClaudeSonnetFourDotSixStream,
  [OpenAIResponsesGlobalGptFiveDotFiveStream.id]:
    OpenAIResponsesGlobalGptFiveDotFiveStream,
  [AgentPlatformEuropeClaudeHaikuFourDotFiveStream.id]:
    AgentPlatformEuropeClaudeHaikuFourDotFiveStream,
} as const satisfies Record<string, StreamEndpointConstructor>;

export type StreamEndpointId = keyof typeof STREAM_ENDPOINTS;
