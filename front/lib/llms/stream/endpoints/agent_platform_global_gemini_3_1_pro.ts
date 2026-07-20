import { WithDustGoogleAiStudioGeminiThreeDotOneProConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_1_pro";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleAiStudioGeminiThreeDotOneProGlobalAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_gemini_3_1_pro_global_agent_platform";

export class DustAgentPlatformGlobalGeminiThreeDotOneProStream extends WithDustGoogleAiStudioGeminiThreeDotOneProConfig(
  GoogleAiStudioGeminiThreeDotOneProGlobalAgentPlatformStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustAgentPlatformGlobalGeminiThreeDotOneProStream);
