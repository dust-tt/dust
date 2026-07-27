import { WithDustGoogleAiStudioGeminiThreeDotFiveFlashLiteConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_5_flash_lite";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleAiStudioGeminiThreeDotFiveFlashLiteGlobalAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_5_flash_lite_global_agent_platform";

export class DustGoogleAiStudioGeminiThreeDotFiveFlashLiteGlobalAgentPlatformStream extends WithDustGoogleAiStudioGeminiThreeDotFiveFlashLiteConfig(
  GoogleAiStudioGeminiThreeDotFiveFlashLiteGlobalAgentPlatformStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustGoogleAiStudioGeminiThreeDotFiveFlashLiteGlobalAgentPlatformStream
);
