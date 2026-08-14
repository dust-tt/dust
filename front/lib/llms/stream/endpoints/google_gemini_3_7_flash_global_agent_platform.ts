import { WithDustGoogleGeminiThreeDotSevenFlashConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_7_flash";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleGeminiThreeDotSevenFlashGlobalAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_7_flash_global_agent_platform";

export class DustGoogleGeminiThreeDotSevenFlashGlobalAgentPlatformStream extends WithDustGoogleGeminiThreeDotSevenFlashConfig(
  GoogleGeminiThreeDotSevenFlashGlobalAgentPlatformStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustGoogleGeminiThreeDotSevenFlashGlobalAgentPlatformStream
);
