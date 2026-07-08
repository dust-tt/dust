import { WithDustGoogleAiStudioGeminiThreeDotOneFlashLiteConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_1_flash_lite";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AgentPlatformEuropeGeminiThreeDotOneFlashLiteStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_gemini_3_1_flash_lite";

export class DustAgentPlatformEuropeGeminiThreeDotOneFlashLiteStream extends WithDustGoogleAiStudioGeminiThreeDotOneFlashLiteConfig(
  AgentPlatformEuropeGeminiThreeDotOneFlashLiteStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustAgentPlatformEuropeGeminiThreeDotOneFlashLiteStream
);
