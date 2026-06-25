import { WithDustGoogleAiStudioGeminiThreeDotFiveFlashConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_5_flash";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AgentPlatformEuropeGeminiThreeDotFiveFlashStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_gemini_3_5_flash";

export class DustAgentPlatformEuropeGeminiThreeDotFiveFlashStream extends WithDustGoogleAiStudioGeminiThreeDotFiveFlashConfig(
  AgentPlatformEuropeGeminiThreeDotFiveFlashStream
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

defineDustStreamEndpoint(DustAgentPlatformEuropeGeminiThreeDotFiveFlashStream);
