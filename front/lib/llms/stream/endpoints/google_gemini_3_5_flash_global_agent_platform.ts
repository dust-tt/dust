import { WithDustGoogleAiStudioGeminiThreeDotFiveFlashConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_5_flash";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleAiStudioGeminiThreeDotFiveFlashGlobalAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_5_flash_global_agent_platform";

export class DustGoogleAiStudioGeminiThreeDotFiveFlashGlobalAgentPlatformStream extends WithDustGoogleAiStudioGeminiThreeDotFiveFlashConfig(
  GoogleAiStudioGeminiThreeDotFiveFlashGlobalAgentPlatformStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustGoogleAiStudioGeminiThreeDotFiveFlashGlobalAgentPlatformStream
);
