import { WithDustGoogleGeminiThreeDotSixFlashConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_6_flash";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { GoogleGeminiThreeDotSixFlashEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_6_flash_eu_agent_platform";

export class DustGoogleGeminiThreeDotSixFlashEuropeAgentPlatformStream extends WithDustGoogleGeminiThreeDotSixFlashConfig(
  GoogleGeminiThreeDotSixFlashEuropeAgentPlatformStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustGoogleGeminiThreeDotSixFlashEuropeAgentPlatformStream
);
