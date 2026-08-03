import { WithDustGoogleGeminiThreeDotFiveFlashConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_5_flash";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleGeminiThreeDotFiveFlashEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_5_flash_eu_agent_platform";

export class DustGoogleGeminiThreeDotFiveFlashEuropeAgentPlatformStream extends WithDustGoogleGeminiThreeDotFiveFlashConfig(
  GoogleGeminiThreeDotFiveFlashEuropeAgentPlatformStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustGoogleGeminiThreeDotFiveFlashEuropeAgentPlatformStream
);
