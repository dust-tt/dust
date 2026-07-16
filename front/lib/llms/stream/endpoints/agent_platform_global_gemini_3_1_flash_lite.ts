import { WithDustGoogleAiStudioGeminiThreeDotOneFlashLiteConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_1_flash_lite";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { AgentPlatformGlobalGeminiThreeDotOneFlashLiteStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_global_gemini_3_1_flash_lite";

export class DustAgentPlatformGlobalGeminiThreeDotOneFlashLiteStream extends WithDustGoogleAiStudioGeminiThreeDotOneFlashLiteConfig(
  AgentPlatformGlobalGeminiThreeDotOneFlashLiteStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustAgentPlatformGlobalGeminiThreeDotOneFlashLiteStream
);
