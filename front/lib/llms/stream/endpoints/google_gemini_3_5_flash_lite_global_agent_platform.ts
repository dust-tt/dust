import { WithDustGoogleGeminiThreeDotFiveFlashLiteConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_5_flash_lite";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleGeminiThreeDotFiveFlashLiteGlobalAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_5_flash_lite_global_agent_platform";

export class DustGoogleGeminiThreeDotFiveFlashLiteGlobalAgentPlatformStream extends WithDustGoogleGeminiThreeDotFiveFlashLiteConfig(
  GoogleGeminiThreeDotFiveFlashLiteGlobalAgentPlatformStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustGoogleGeminiThreeDotFiveFlashLiteGlobalAgentPlatformStream
);
