import { WithDustGoogleGeminiThreeDotSevenFlashConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_7_flash";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleGeminiThreeDotSevenFlashEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_7_flash_eu_agent_platform";

export class DustGoogleGeminiThreeDotSevenFlashEuropeAgentPlatformStream extends WithDustGoogleGeminiThreeDotSevenFlashConfig(
  GoogleGeminiThreeDotSevenFlashEuropeAgentPlatformStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustGoogleGeminiThreeDotSevenFlashEuropeAgentPlatformStream
);
