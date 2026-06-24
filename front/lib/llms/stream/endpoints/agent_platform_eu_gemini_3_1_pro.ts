import { WithDustGoogleAiStudioGeminiThreeDotOneProConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_1_pro";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AgentPlatformEuropeGeminiThreeDotOneProStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_gemini_3_1_pro";

export class DustAgentPlatformEuropeGeminiThreeDotOneProStream extends WithDustGoogleAiStudioGeminiThreeDotOneProConfig(
  AgentPlatformEuropeGeminiThreeDotOneProStream
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

defineDustStreamEndpoint(DustAgentPlatformEuropeGeminiThreeDotOneProStream);
