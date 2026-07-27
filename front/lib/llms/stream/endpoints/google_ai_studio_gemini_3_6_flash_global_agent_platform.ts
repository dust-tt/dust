import { WithDustGoogleAiStudioGeminiThreeDotSixFlashConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_6_flash";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleAiStudioGeminiThreeDotSixFlashGlobalAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_ai_studio_gemini_3_6_flash_global_agent_platform";

export class DustGoogleAiStudioGeminiThreeDotSixFlashGlobalAgentPlatformStream extends WithDustGoogleAiStudioGeminiThreeDotSixFlashConfig(
  GoogleAiStudioGeminiThreeDotSixFlashGlobalAgentPlatformStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustGoogleAiStudioGeminiThreeDotSixFlashGlobalAgentPlatformStream
);
