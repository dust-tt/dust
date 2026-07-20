import { WithDustGoogleAiStudioGeminiThreeDotFiveFlashConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_5_flash";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AgentPlatformGlobalGeminiThreeDotFiveFlashStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_global_gemini_3_5_flash";

export class DustAgentPlatformGlobalGeminiThreeDotFiveFlashStream extends WithDustGoogleAiStudioGeminiThreeDotFiveFlashConfig(
  AgentPlatformGlobalGeminiThreeDotFiveFlashStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustAgentPlatformGlobalGeminiThreeDotFiveFlashStream);
