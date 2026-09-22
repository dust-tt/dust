import { WithDustGoogleGeminiThreeDotFiveFlashLiteConfig } from "@app/lib/llms/providers/google_ai_studio/models/gemini_3_5_flash_lite";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { EU_AGENT_PLATFORM_ENDPOINT_FILTER } from "@app/lib/llms/utils/endpoint_filters";
import { GoogleGeminiThreeDotFiveFlashLiteEuropeAgentPlatformStream } from "@app/lib/model_constructors/stream/endpoints/google_gemini_3_5_flash_lite_eu_agent_platform";

export class DustGoogleGeminiThreeDotFiveFlashLiteEuropeAgentPlatformStream extends WithDustGoogleGeminiThreeDotFiveFlashLiteConfig(
  GoogleGeminiThreeDotFiveFlashLiteEuropeAgentPlatformStream
) {
  static readonly endpointFilter = EU_AGENT_PLATFORM_ENDPOINT_FILTER;
}

defineDustStreamEndpoint(
  DustGoogleGeminiThreeDotFiveFlashLiteEuropeAgentPlatformStream
);
