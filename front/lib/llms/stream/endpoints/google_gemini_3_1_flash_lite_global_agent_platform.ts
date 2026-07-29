import { WithDustGoogleGeminiThreeDotOneFlashLiteConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_1_flash_lite";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleGeminiThreeDotOneFlashLiteGlobalAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_1_flash_lite_global_agent_platform";

export class DustGoogleGeminiThreeDotOneFlashLiteGlobalAgentPlatformStream extends WithDustGoogleGeminiThreeDotOneFlashLiteConfig(
  GoogleGeminiThreeDotOneFlashLiteGlobalAgentPlatformStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustGoogleGeminiThreeDotOneFlashLiteGlobalAgentPlatformStream
);
