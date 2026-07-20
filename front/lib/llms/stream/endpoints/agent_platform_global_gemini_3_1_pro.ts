import { WithDustGoogleAiStudioGeminiThreeDotOneProConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_1_pro";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AgentPlatformGlobalGeminiThreeDotOneProStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_global_gemini_3_1_pro";

export class DustAgentPlatformGlobalGeminiThreeDotOneProStream extends WithDustGoogleAiStudioGeminiThreeDotOneProConfig(
  AgentPlatformGlobalGeminiThreeDotOneProStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustAgentPlatformGlobalGeminiThreeDotOneProStream);
