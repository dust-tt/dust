import { WithDustGoogleGeminiThreeDotOneProConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_1_pro";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleGeminiThreeDotOneProGlobalAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_1_pro_global_agent_platform";

export class DustGoogleGeminiThreeDotOneProGlobalAgentPlatformStream extends WithDustGoogleGeminiThreeDotOneProConfig(
  GoogleGeminiThreeDotOneProGlobalAgentPlatformStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustGoogleGeminiThreeDotOneProGlobalAgentPlatformStream
);
