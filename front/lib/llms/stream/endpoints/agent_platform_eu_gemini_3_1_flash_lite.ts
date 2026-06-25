import { WithDustGoogleAiStudioGeminiThreeDotOneFlashLiteConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_1_flash_lite";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AgentPlatformEuropeGeminiThreeDotOneFlashLiteStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_gemini_3_1_flash_lite";

export class DustAgentPlatformEuropeGeminiThreeDotOneFlashLiteStream extends WithDustGoogleAiStudioGeminiThreeDotOneFlashLiteConfig(
  AgentPlatformEuropeGeminiThreeDotOneFlashLiteStream
) {
  static readonly endpointFilter = {
    or: [
      {
        featureFlags: { contains: "use_vertex_for_supported_models" as const },
      },
      { isCreditPriced: { eq: true } },
    ],
  };
}

defineDustStreamEndpoint(
  DustAgentPlatformEuropeGeminiThreeDotOneFlashLiteStream
);
