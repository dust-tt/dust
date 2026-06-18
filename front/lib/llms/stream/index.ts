import type { DustStreamEndpointConstructor } from "@app/lib/llms/stream/dust_stream_endpoint";
import { DustAgentPlatformEuropeClaudeSonnetFourDotSixStream } from "@app/lib/llms/stream/endpoints/agent_platform_eu_claude_sonnet_four_dot_six";
import { DustAnthropicGlobalClaudeSonnetFourDotSixStream } from "@app/lib/llms/stream/endpoints/anthropic_global_claude_sonnet_four_dot_six";
import { DustGoogleAiStudioGlobalGemini31FlashLiteStream } from "@app/lib/llms/stream/endpoints/google_ai_studio_global_gemini_3_1_flash_lite";
import { DustGoogleAiStudioGlobalGemini31ProStream } from "@app/lib/llms/stream/endpoints/google_ai_studio_global_gemini_3_1_pro";
import { DustGoogleAiStudioGlobalGemini35FlashStream } from "@app/lib/llms/stream/endpoints/google_ai_studio_global_gemini_3_5_flash";
import { DustMistralEuropeCodestralStream } from "@app/lib/llms/stream/endpoints/mistral_eu_codestral";
import { DustMistralEuropeMistralLargeStream } from "@app/lib/llms/stream/endpoints/mistral_eu_mistral_large";
import { DustMistralEuropeMistralMedium35Stream } from "@app/lib/llms/stream/endpoints/mistral_eu_mistral_medium_3_5";
import { DustMistralEuropeMistralSmallStream } from "@app/lib/llms/stream/endpoints/mistral_eu_mistral_small";
import { DustOpenAIResponsesGlobalGptFiveDotFiveStream } from "@app/lib/llms/stream/endpoints/openai_responses_global_gpt_five_dot_five";
import { isEndpointAvailable } from "@app/lib/llms/stream/utils/is_endpoint_available";
import type {
  EndpointConfig,
  Where,
  WorkspaceConfig,
} from "@app/lib/llms/types/filter";
import type { StreamEndpointId } from "@app/lib/model_constructors/stream";

export const DUST_STREAM_ENDPOINTS = {
  [DustAnthropicGlobalClaudeSonnetFourDotSixStream.id]:
    DustAnthropicGlobalClaudeSonnetFourDotSixStream,
  [DustAgentPlatformEuropeClaudeSonnetFourDotSixStream.id]:
    DustAgentPlatformEuropeClaudeSonnetFourDotSixStream,
  [DustGoogleAiStudioGlobalGemini31ProStream.id]:
    DustGoogleAiStudioGlobalGemini31ProStream,
  [DustGoogleAiStudioGlobalGemini35FlashStream.id]:
    DustGoogleAiStudioGlobalGemini35FlashStream,
  [DustOpenAIResponsesGlobalGptFiveDotFiveStream.id]:
    DustOpenAIResponsesGlobalGptFiveDotFiveStream,
  [DustGoogleAiStudioGlobalGemini31FlashLiteStream.id]:
    DustGoogleAiStudioGlobalGemini31FlashLiteStream,
  [DustMistralEuropeMistralLargeStream.id]: DustMistralEuropeMistralLargeStream,
  [DustMistralEuropeMistralMedium35Stream.id]:
    DustMistralEuropeMistralMedium35Stream,
  [DustMistralEuropeMistralSmallStream.id]: DustMistralEuropeMistralSmallStream,
  [DustMistralEuropeCodestralStream.id]: DustMistralEuropeCodestralStream,
} as const satisfies Record<StreamEndpointId, DustStreamEndpointConstructor>;

export function getStreamEndpoints(
  workspaceConfiguration: WorkspaceConfig,
  inputCondition: Where<EndpointConfig>
) {
  return Object.values(DUST_STREAM_ENDPOINTS).filter((constructor) =>
    isEndpointAvailable(constructor, workspaceConfiguration, inputCondition)
  );
}
