import { WithDustGoogleGeminiThreeDotFiveFlashConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_5_flash";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleGeminiThreeDotFiveFlashGlobalAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_5_flash_global_agent_platform";

export class DustGoogleGeminiThreeDotFiveFlashGlobalAgentPlatformStream extends WithDustGoogleGeminiThreeDotFiveFlashConfig(
  GoogleGeminiThreeDotFiveFlashGlobalAgentPlatformStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustGoogleGeminiThreeDotFiveFlashGlobalAgentPlatformStream
);
